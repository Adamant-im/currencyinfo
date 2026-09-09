import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    coin: z.string().min(1),
    amount: z.coerce.number().positive(),
  });

  const pipe = new ZodValidationPipe(schema);

  it('should pass and transform valid input', () => {
    const input = { coin: 'ADM', amount: '42' };
    const result = pipe.transform(input);
    expect(result).toEqual({ coin: 'ADM', amount: 42 });
  });

  it('should throw ZodError on invalid input', () => {
    const invalidInput = { coin: '', amount: '-5' };
    expect(() => pipe.transform(invalidInput)).toThrow();
  });
});
