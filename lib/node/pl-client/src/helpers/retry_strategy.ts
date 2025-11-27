export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 10,
  initialDelay: 100,
  maxDelay: 30000,
};

export interface RetryCallbacks {
  onRetry: () => void;
  onMaxAttemptsReached: (error: Error) => void;
}

export class RetryStrategy {
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly config: RetryConfig;
  private readonly callbacks: RetryCallbacks;
  private readonly backoff: ExponentialBackoff;

  constructor(config: Partial<RetryConfig>, callbacks: RetryCallbacks) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.callbacks = callbacks;
    this.backoff = new ExponentialBackoff({
      initialDelay: this.config.initialDelay,
      maxDelay: this.config.maxDelay,
      factor: 2,
      jitter: 0.1,
    });
  }

  schedule(): void {
    if (this.timer) return;
    if (this.hasExceededLimit()) {
      this.notifyMaxAttemptsReached();
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      this.attempts++;
      this.callbacks.onRetry();
    }, this.backoff.delay());
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  reset(): void {
    this.attempts = 0;
    this.backoff.reset();
  }

  private hasExceededLimit(): boolean {
    return this.attempts >= this.config.maxAttempts;
  }

  private notifyMaxAttemptsReached(): void {
    const error = new Error(
      `Max retry attempts (${this.config.maxAttempts}) reached`,
    );
    this.callbacks.onMaxAttemptsReached(error);
  }
}

interface ExponentialBackoffConfig {
  initialDelay: number;
  maxDelay: number;
  factor: number;
  jitter: number;
}

class ExponentialBackoff {
  private readonly initialDelay: number;
  private readonly maxDelay: number;

  private currentDelay: number;

  private readonly factor: number;
  private readonly jitter: number;

  constructor(config: ExponentialBackoffConfig) {
    this.initialDelay = config.initialDelay;
    this.maxDelay = config.maxDelay;
    this.factor = config.factor;
    this.jitter = config.jitter;
    this.currentDelay = config.initialDelay;
  }

  delay(): number {
    if (this.currentDelay >= this.maxDelay) {
      return this.applyJitter(this.maxDelay);
    }

    this.currentDelay = this.currentDelay * this.factor;

    if (this.currentDelay > this.maxDelay) {
      this.currentDelay = this.maxDelay;
    }

    return this.applyJitter(this.currentDelay);
  }

  reset(): void {
    this.currentDelay = this.initialDelay;
  }

  private applyJitter(delay: number): number {
    if (delay === 0 || this.jitter === 0) {
      return delay;
    }
    const delayFactor = 1 - (this.jitter / 2) + Math.random() * this.jitter;
    return delay * delayFactor;
  }
}
