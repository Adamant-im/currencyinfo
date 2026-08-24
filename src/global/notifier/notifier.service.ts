import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';

import axios from 'axios';

import { LogLevelName } from 'src/global/logger/logger.constants';
import {
  formatMessageForAdamant,
  formatMessageForDiscord,
  makeBoldForSlack,
  removeMarkdown,
} from 'src/shared/utils';
import { api } from './adamant/api';

const slackColors: Record<LogLevelName, string> = {
  error: '#FF0000',
  warn: '#FFFF00',
  log: '#FFFFFF',
  info: '#36A64F',
};

const discordColors: Record<LogLevelName, string> = {
  error: '16711680',
  warn: '16776960',
  log: '16777215',
  info: '3581775',
};

/**
 * Multi-channel notification dispatcher supporting Slack, Discord, and ADAMANT blockchain messenger.
 */
@Injectable()
export class Notifier {
  private logger = new Logger();

  constructor(private config: ConfigService) {}

  /**
   * Dispatches a notification across all configured channels (Slack, Discord, ADAMANT) and logs it.
   *
   * @param notifyLevel - Severity level of the notification ('error' | 'warn' | 'log' | 'info')
   * @param message - Notification message content
   */
  async notify(notifyLevel: LogLevelName, message: string): Promise<void> {
    const logMethod = notifyLevel === 'info' ? 'log' : notifyLevel;
    this.logger[logMethod](removeMarkdown(message));

    const notify = this.config.get('notify');

    if (!notify) {
      return;
    }

    const name = this.config.get('name') as string;
    const notifyMessage = `**${name}**# ${message}`;

    await Promise.allSettled([
      this.notifySlack(notifyLevel, notifyMessage),
      this.notifyDiscord(notifyLevel, notifyMessage),
      this.notifyAdamant(notifyLevel, notifyMessage),
    ]);
  }

  /**
   * Sends notifications to configured Slack webhooks.
   */
  async notifySlack(notifyLevel: LogLevelName, message: string): Promise<void> {
    const slack = this.config.get<string[]>('notify.slack');

    if (!slack || !slack.length) {
      return;
    }

    const params = {
      attachments: [
        {
          fallback: message,
          color: slackColors[notifyLevel],
          text: makeBoldForSlack(message),
          mrkdwn_in: ['text'],
        },
      ],
    };

    for (const slackApp of slack) {
      try {
        await axios.post(slackApp, params, { timeout: 10000 });
      } catch (error) {
        this.logger.warn(`Request to Slack with message '${message}' failed: ${error}.`);
      }
    }
  }

  /**
   * Sends notifications to configured Discord webhooks.
   */
  async notifyDiscord(notifyLevel: LogLevelName, message: string): Promise<void> {
    const threads = this.config.get<string[]>('notify.discord');

    if (!threads || !threads.length) {
      return;
    }

    const params = {
      embeds: [
        {
          color: discordColors[notifyLevel],
          description: formatMessageForDiscord(message),
        },
      ],
    };

    const promises = threads.map(async (thread) => {
      try {
        await axios.post(thread, params, { timeout: 10000 });
      } catch (error) {
        this.logger.warn(`Request to Discord with message '${message}' failed: ${error}.`);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Sends notifications as encrypted direct messages via ADAMANT blockchain.
   */
  async notifyAdamant(notifyLevel: LogLevelName, message: string): Promise<void> {
    const addresses = this.config.get<string[]>('notify.adamant');
    const passphrase = this.config.get<string>('notify.adamantPassphrase');

    if (!addresses || !addresses.length || !passphrase) {
      return;
    }

    const promises = addresses.map(async (address) => {
      const formattedMessage = formatMessageForAdamant(message);

      try {
        const response = await api.sendMessage(
          passphrase,
          address,
          `${notifyLevel}| ${formattedMessage}`,
        );

        if (!response.success) {
          throw new Error(JSON.stringify(response));
        }
      } catch (error) {
        this.logger.warn(
          `Failed to send notification message '${formattedMessage}' to ${address}: ${error}.`,
        );
      }
    });

    await Promise.all(promises);
  }
}
