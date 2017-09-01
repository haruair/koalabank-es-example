function generatedId() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  )
}

class LocalStorageEventStore {
  getStorage() {
    var raw = window.localStorage.getItem('event-store')
    var data = JSON.parse(raw) || []

    data = data.map(v => {
      var payload = v.domainEvent.payload
      var props = this.convertPayloadToProps(payload)
      var event = Object.create(eval(v['@type']).prototype, props)
      var createdAt = v['@createdAt']
      return new DomainEvent(payload.id, event, createdAt)
    })

    return data
  }

  convertPayloadToProps(payload) {
    var props = {}
    Object.keys(payload).forEach(key => {
      props[key] = {
        value: payload[key],
        enumerable: true
      }
    })
    return props
  }

  setStorage(stream) {
    var data = stream.map(domainEvent => {
      return {
        '@type': domainEvent.payload.constructor.name,
        '@createdAt': domainEvent.createdAt,
        domainEvent: domainEvent
      }
    })
    window.localStorage.setItem('event-store', JSON.stringify(data))
  }

  load(id) {
    var data = this.getStorage()
    return data.filter(v => v.id == id)
  }

  append(id, eventStream) {
    var createdAt = new Date().getTime()
    var stream = eventStream.map(payload => new DomainEvent(id, payload, createdAt))
    var data = this.getStorage()
    this.setStorage(data.concat(stream))
  }

  fetch(criteria, callback) {
    this.getStorage().filter(criteria).forEach(event => callback.call(null, event));
  }
}

class EventStore {
  load(id) {
    this.events = this.events || [];
    return this.events.filter(v => v.id == id)
  }

  append(id, eventStream) {
    var createdAt = new Date().getTime()
    var stream = eventStream.map(payload => new DomainEvent(id, payload, createdAt))
    this.events = this.events || [];
    this.events = this.events.concat(stream);
  }

  fetch(criteria, callback) {
    this.events = this.events || [];
    this.events.filter(criteria).forEach(event => callback.call(null, event));
  }
}

class EventBus {
  subscribe(eventHandler) {
    this.eventHandlers = this.eventHandlers || [];
    this.eventHandlers.push(eventHandler);
  }

  publish(eventStream) {
    this.eventHandlers = this.eventHandlers || [];
    this.queue = this.queue || [];

    eventStream.forEach(event => {
      this.queue.push(event);
    })

    if (this.isPublishing) return;
    this.isPublishing = true

    while(this.queue.length > 0) {
      var queue = this.queue.shift();
      this.eventHandlers.forEach(handler => {
        handler.handle(queue)
      })
    }

    this.isPublishing = false
  }
}

class Repository {
  constructor(eventStore, eventBus, aggregateClass) {
    this.eventStore = eventStore
    this.eventBus = eventBus
    this.aggregateClass = aggregateClass
  }

  load(id) {
    var events = this.eventStore.load(id)

    var aggregate = Object.create(this.aggregateClass.prototype)
    aggregate.initializeState(events)
    return aggregate
  }

  save(aggregate) {
    var eventStream = aggregate.getUncommittedEvents()
    this.eventStore.append(aggregate.id, eventStream)
    this.eventBus.publish(eventStream)
  }
}

class DomainEvent {
  constructor(id, payload, createdAt) {
    this.id = id
    this.payload = payload
    this.createdAt = createdAt
  }
}

class DomainEventStream {
  constructor(events) {
    this.events = events
  }
}

class OpenCommand {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }
}

class WithdrawCommand {
  constructor(id, amount) {
    this.id = id;
    this.amount = amount;
  }
}

class DepositCommand {
  constructor(id, amount) {
    this.id = id;
    this.amount = amount;
  }
}

class CloseCommand {
  constructor(id) {
    this.id = id;
  }
}

class OpenedEvent {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }
}

class WithdrawedEvent {
  constructor(id, amount) {
    this.id = id;
    this.amount = amount;
  }
}

class DepositedEvent {
  constructor(id, amount) {
    this.id = id;
    this.amount = amount;
  }
}

class ClosedEvent {
  constructor(id) {
    this.id = id;
  }
}

class AggregateRoot {
  apply(event) {
    this.version = this.version !== undefined ? this.version : -1
    this.version++
    this.handle(event)
    this.uncommittedEvents = this.uncommittedEvents || []
    this.uncommittedEvents.push(event);
  }

  getUncommittedEvents() {
    this.uncommittedEvents = this.uncommittedEvents || []
    var stream = this.uncommittedEvents
    delete this.uncommittedEvents
    return stream;
  }

  getVersion() {
    return this.version !== undefined ? this.version : -1;
  }

  handle(event) {
    var eventName = event.constructor.name
    eventName = 'apply' + eventName.charAt(0).toUpperCase() + eventName.slice(1);
    if (!this[eventName]) {
      return;
    }

    this[eventName](event)
  }

  initializeState(eventStream) {
    this.version = this.version !== undefined ? this.version : -1
    eventStream.forEach(domainEvent => {
      this.version++
      this.handle(domainEvent.payload)
    })
  }
}

class BankAccount extends AggregateRoot {
  static open(id, name) {
    var bankAccount = new BankAccount;
    bankAccount.apply(new OpenedEvent(id, name));
    return bankAccount;
  }

  withdraw(amount) {
    if (this.closed) {
      throw new Error('Account is already closed.')
    }
    this.apply(new WithdrawedEvent(this.id, amount))
  }

  deposit(amount) {
    if (this.closed) {
      throw new Error('Account is already closed.')
    }
    this.apply(new DepositedEvent(this.id, amount))
  }

  close() {
    if (!this.closed) {
      this.apply(new ClosedEvent(this.id))
    }
  }

  applyOpenedEvent(event) {
    this.id = event.id
    this.name = event.name
    this.balance = 0
    this.closed = false
  }

  applyWithdrawedEvent(event) {
    this.balance = this.balance || 0;
    this.balance -= event.amount
  }

  applyDepositedEvent(event) {
    this.balance = this.balance || 0;
    this.balance += event.amount
  }

  applyClosedEvent(event) {
    this.closed = true
  }
}

class CommandHandler {
  handle(command) {
    var commandName = command.constructor.name;
    commandName = 'handle' + commandName.charAt(0).toUpperCase() + commandName.slice(1);
    if (!this[commandName]) {
      return
    }

    this[commandName](command)
  }
}

class BankAccountCommandHandler extends CommandHandler {
  constructor(repository) {
    super()
    this.repository = repository
  }

  handleOpenCommand(command) {
    var account = BankAccount.open(command.id, command.name)
    this.repository.save(account)
  }

  handleCloseCommand(command) {
    var account = this.repository.load(command.id)
    try {
      account.close()
    } catch(e) {
      alert(e)
      return
    }
    this.repository.save(account)
  }

  handleWithdrawCommand(command) {
    var account = this.repository.load(command.id)
    try {
      account.withdraw(command.amount)
    } catch (e) {
      alert(e)
      return
    }
    this.repository.save(account)
  }

  handleDepositCommand(command) {
    var account = this.repository.load(command.id)
    try {
      account.deposit(command.amount)
    } catch (e) {
      alert(e)
      return
    }
    this.repository.save(account)
  }
}

class CommandBus {
  subscribe(commandHandler) {
    this.commandHandlers = this.commandHandlers || []
    this.commandHandlers.push(commandHandler)
  }

  dispatch(command) {
    this.commandHandlers = this.commandHandlers || []
    this.isDispatching = this.isDispatching !== undefined ? this.isDispatching : false

    if (this.isDispatching) {
      return
    }

    this.isDispatching = true
    this.commandHandlers.forEach(commandHandler => {
      commandHandler.handle(command)
    })
    this.isDispatching = false
  }
}

class EventSubscriber {
  handle(event) {
    var eventName = event.constructor.name
    eventName = 'apply' + eventName.charAt(0).toUpperCase() + eventName.slice(1);
    if (!this[eventName]) {
      return;
    }

    this[eventName](event)
  }
}

class AccountsSubscriber extends EventSubscriber {
  constructor(dataset) {
    super()
    this.dataset = dataset
  }
  applyOpenedEvent(event) {
    this.dataset.push({ id: event.id, name: event.name, balance: 0, closed: false })
  }
  applyWithdrawedEvent(event) {
    this.dataset.filter(v => v.id == event.id).forEach(v => v.balance -= event.amount)
  }
  applyDepositedEvent(event) {
    this.dataset.filter(v => v.id == event.id).forEach(v => v.balance += event.amount)
  }
  applyClosedEvent(event) {
    this.dataset.filter(v => v.id == event.id).forEach(v => v.closed = true)
  }
}

class SimpleSubscriber extends EventSubscriber {
  constructor(callback) {
    super()
    this.callback = callback
  }
  handle(event) {
    this.callback(event)
  }
}
