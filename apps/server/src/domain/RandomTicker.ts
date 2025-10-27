export type RandomTick = {
  symbol: string;
  exchange: "BINANCE";
  price: number;
  tsMs: number;
};

export interface CloseHandle {
  close(): Promise<void>;
}

/**
 * Very small in-process price generator.
 * Emits a tick every ~250ms with small random walk noise.
 */
export class RandomTicker {
  private timer?: NodeJS.Timeout;
  private price: number;

  constructor(private readonly symbol: string, startPrice = 10000) {
    this.price = startPrice;
  }

  start(onTick: (t: RandomTick) => void): CloseHandle {
    const emit = () => {
      // random walk with gentle drift
      const delta = (Math.random() - 0.5) * 50;
      this.price = Math.max(0, this.price + delta);
      onTick({
        symbol: this.symbol,
        exchange: "BINANCE",
        price: Math.round(this.price * 100) / 100,
        tsMs: Date.now(),
      });
    };

    // fire an initial tick quickly, then interval
    emit();
    this.timer = setInterval(emit, 250);

    return {
      close: async () => {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = undefined;
        }
      },
    };
  }
}
