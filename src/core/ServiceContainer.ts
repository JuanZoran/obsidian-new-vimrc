/**
 * ServiceContainer - Dependency Injection Container
 *
 * Provides dependency injection with support for:
 * - Transient services (new instance per resolve)
 * - Singleton services (shared instance)
 * - Lazy initialization (factory called on first resolve)
 * - Circular dependency detection
 *
 * @module core/ServiceContainer
 */

import type { IServiceContainer, ServiceToken, ServiceFactory } from '../types/services';

/**
 * Registration types for services
 */
enum RegistrationType {
  TRANSIENT = 'transient',
  SINGLETON = 'singleton',
  INSTANCE = 'instance',
}

/**
 * Service registration entry
 */
interface ServiceRegistration<T = unknown> {
  type: RegistrationType;
  factory?: ServiceFactory<T>;
  instance?: T;
}

/**
 * Disposable interface for services that need cleanup
 */
interface Disposable {
  dispose(): void;
}

/**
 * Check if an object is disposable
 */
function isDisposable(obj: unknown): obj is Disposable {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'dispose' in obj &&
    typeof (obj as Disposable).dispose === 'function'
  );
}

/**
 * ServiceContainer implementation
 *
 * Manages service registration, resolution, and lifecycle.
 * Supports lazy initialization and circular dependency detection.
 */
export class ServiceContainer implements IServiceContainer {
  private registrations = new Map<symbol, ServiceRegistration>();
  private singletonInstances = new Map<symbol, unknown>();
  private resolutionStack: symbol[] = [];

  /**
   * Register a transient service (new instance each resolve)
   */
  register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.registrations.set(token, {
      type: RegistrationType.TRANSIENT,
      factory,
    });
  }

  /**
   * Register a singleton service (lazy initialization)
   */
  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.registrations.set(token, {
      type: RegistrationType.SINGLETON,
      factory,
    });
  }

  /**
   * Register an existing instance as a singleton
   */
  registerInstance<T>(token: ServiceToken<T>, instance: T): void {
    this.registrations.set(token, {
      type: RegistrationType.INSTANCE,
      instance,
    });
    this.singletonInstances.set(token, instance);
  }

  /**
   * Resolve a service by its token
   * @throws Error if service is not registered or circular dependency detected
   */
  resolve<T>(token: ServiceToken<T>): T {
    const registration = this.registrations.get(token);

    if (!registration) {
      throw new Error(`Service not registered: ${token.toString()}`);
    }

    // Check for circular dependency
    if (this.resolutionStack.includes(token)) {
      const cycle = [...this.resolutionStack, token]
        .map((t) => t.toString())
        .join(' -> ');
      throw new Error(`Circular dependency detected: ${cycle}`);
    }

    // Handle instance registration (already resolved)
    if (registration.type === RegistrationType.INSTANCE) {
      return registration.instance as T;
    }

    // Handle singleton (check cache first)
    if (registration.type === RegistrationType.SINGLETON) {
      if (this.singletonInstances.has(token)) {
        return this.singletonInstances.get(token) as T;
      }
    }

    // Create instance using factory
    if (!registration.factory) {
      throw new Error(`No factory registered for service: ${token.toString()}`);
    }

    // Track resolution for circular dependency detection
    this.resolutionStack.push(token);

    try {
      const instance = registration.factory(this) as T;

      // Cache singleton instance
      if (registration.type === RegistrationType.SINGLETON) {
        this.singletonInstances.set(token, instance);
      }

      return instance;
    } finally {
      this.resolutionStack.pop();
    }
  }

  /**
   * Check if a service is registered
   */
  has<T>(token: ServiceToken<T>): boolean {
    return this.registrations.has(token);
  }

  /**
   * Dispose all services and clear registrations
   */
  dispose(): void {
    // Dispose all singleton instances that implement Disposable
    for (const instance of this.singletonInstances.values()) {
      if (isDisposable(instance)) {
        try {
          instance.dispose();
        } catch {
          // Ignore disposal errors
        }
      }
    }

    // Clear all state
    this.singletonInstances.clear();
    this.registrations.clear();
    this.resolutionStack = [];
  }
}
