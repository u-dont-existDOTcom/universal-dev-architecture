export class ServiceRegistry {
  #services = new Map();

  register(name, service) {
    if (typeof name !== "string" || name.length === 0) throw new TypeError("name is required");
    if (this.#services.has(name)) throw new Error(`Service already registered: ${name}`);
    this.#services.set(name, service);
    return this;
  }

  get(name) {
    return this.#services.get(name);
  }

  get size() {
    return this.#services.size;
  }
}
