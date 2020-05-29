export {};

const Reply = require("./Reply");

const Controller = require("./Controller");

class Manager {
  /**
   * Maps resources by paths to their last known values.
   */
  cache: Map<string, any>;

  /**
   * Maps resources by path to subscribers (clients). Clients are represented by callback functions.
   */
  dependents: Map<string, Set<Function>>;

  /**
   * Maps clients (represented by callback functions) to subscriptions (resource paths).
   */
  subscriptions: Map<Function, Set<string>>;

  /**
   * The function which will be invoked to to execute requests when a cached resource is invalidated or unavailable.
   */
  generator: Function;

  /**
   * @param router An Express router which will handle uncached requests.
   */
  constructor(controller: typeof Controller) {
    this.cache = new Map();
    this.dependents = new Map();
    this.subscriptions = new Map();
    this.generator = (...args): typeof Reply => controller.request(...args);
  }

  /**
   * Subscribes a client to a given resource path.
   * Subscriptions are many-to-many relationships between clients and resources.
   * Client-to-resource associations are stored in Manager.prototype.subscriptions.
   * Resource-to-client associations are stored in Manager.prototype.dependents.
   * @param client A function representing the client that requested the resource. Will be invoked when the resource changes state.
   * @param path A resource path
   */
  subscribe(client: Function, path: string) {
    if (!this.subscriptions.has(client)) {
      this.subscriptions.set(client, new Set());
    }
    if (!this.dependents.has(path)) {
      this.dependents.set(path, new Set());
    }

    const dependents = this.dependents.get(path);
    dependents.add(client);
    console.log(dependents);

    const subscriptions = this.subscriptions.get(client);
    subscriptions.add(path);
  }

  /**
   * Removes all associations between a given client and a given resource path.
   * If no path is specified, unsubscribes the client from all resources.
   * @param client A function representing a client.
   * @param path A resource path.
   */
  unsubscribe(client: Function, path: string = null) {
    const subscriptions = this.subscriptions.get(client);
    const remove = path ? [path] : subscriptions;
    remove.forEach((target) => {
      subscriptions.delete(target);

      const dependents = this.dependents.get(target);
      dependents.delete(client);
    });

    console.log(this.subscriptions);
  }

  /**
   * Recalculates the cached value of a given resource.
   * Invokes all subscriber functions with the new value.
   * @param path A resource path
   * @returns The new value of the resource.
   */
  async update(path: string) {
    // the generator always returns an instance of Reply
    const result = await this.generator("get", path);

    if (!result.isError()) {
      // if it's not an error, update the cache and send the new state to all subscribers
      this.cache.set(path, result.payload);
      if (this.dependents.has(path)) {
        this.dependents.get(path).forEach((client) => {
          client(path, this.cache.get(path));
        });
      }
    } else if (result.status === 404) {
      // otherwise, if the resource was not found, remove the resource from the cache,
      // unsubscribe all subscribers and alert them with the new state (undefined).
      this.cache.delete(path);
      if (this.dependents.has(path)) {
        this.dependents.get(path).forEach((client) => {
          this.unsubscribe(client, path);
          client(path, undefined);
        });
      }
    }

    return result;
  }

  async get(path, data) {
    if (this.cache.has(path)) {
      return Reply.OK(this.cache.get(path));
    }
    return this.update(path);
  }

  async post(path, data) {
    const result = await this.generator("post", path, data);
    if (!result.isError()) {
      this.update(path);
    }
    return result;
  }

  async put(path, data) {
    const result = await this.generator("put", path, data);
    if (!result.isError()) {
      this.update(path);
    }
    return result;
  }

  async patch(path, data) {
    const result = await this.generator("patch", path, data);
    if (!result.isError()) {
      this.update(path);
    }
    return result;
  }

  async delete(path) {
    const result = await this.generator("delete", path, null);
    if (!result.isError()) {
      this.update(path);
    }
    return result;
  }
}

module.exports = Manager;
