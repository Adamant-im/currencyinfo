import { Test, TestingModule } from '@nestjs/testing';
import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';

describe('RatesController', () => {
  let controller: RatesController;
  let ratesService: Partial<RatesService>;

  beforeEach(async () => {
    ratesService = {
      getTickers: jest.fn().mockResolvedValue({ 'ADM/USD': 0.05 }),
      getHistoryTickers: jest.fn().mockResolvedValue([{ date: 1000, tickers: {} }]),
      lastUpdated: 1700000000000,
      refreshInterval: 600000,
      initializationTimestamp: 1699999000000,
      isUpdating: false,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RatesController],
      providers: [
        {
          provide: RatesService,
          useValue: ratesService,
        },
      ],
    }).compile();

    controller = module.get<RatesController>(RatesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getRates', () => {
    it('should return exchange rates result object', async () => {
      const response = await controller.getRates({ coin: ['ADM'], rateLifetime: 60 });
      expect(ratesService.getTickers).toHaveBeenCalledWith(['ADM'], 60);
      expect(response).toEqual({ result: { 'ADM/USD': 0.05 } });
    });
  });

  describe('getHistory', () => {
    it('should return historical tickers result object', async () => {
      const query = { coin: 'ADM', limit: 10 };
      const response = await controller.getHistory(query);
      expect(ratesService.getHistoryTickers).toHaveBeenCalledWith(query);
      expect(response).toEqual({ result: [{ date: 1000, tickers: {} }] });
    });
  });

  describe('getStatus', () => {
    it('should return readiness and next update timestamp', () => {
      const status = controller.getStatus();
      expect(status.ready).toBe(true);
      expect(status.next_update).toBe(1700000000000 + 600000);
    });

    it('should report the actual refresh state rather than an overdue schedule', () => {
      // Overdue but idle: a failed cycle must not be reported as an update in flight.
      expect(controller.getStatus().updating).toBe(false);

      (ratesService as { isUpdating: boolean }).isUpdating = true;
      expect(controller.getStatus().updating).toBe(true);
    });
  });
});
