import {
  PipeTransform,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

/**
 * Syntax: ADM,CYN,usdc
 *
 * 1. Does not allow commas at the beginning or end of the string.
 * 2. Does not allow two or more consecutive commas.
 * 3. Does not allow spaces or any other symbols
 *    except letters (both lowercase and uppercase) and commas.
 */
const coinListRegex = /^[a-zA-Z]+(?:,[a-zA-Z]+)*$/;

@Injectable()
export class ParseCoinsPipe implements PipeTransform<string, string[]> {
  transform(coins?: string) {
    if (coins === undefined) {
      return [];
    }

    if (!coins.match(coinListRegex)) {
      throw new HttpException('Invalid coin list', HttpStatus.BAD_REQUEST);
    }

    return coins.toUpperCase().split(',');
  }
}
