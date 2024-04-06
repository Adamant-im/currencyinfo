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

const slackColors = {
  error: '#FF0000',
  warn: '#FFFF00',
  info: '#00FF00',
  log: '#FFFFFF',
};

const discordColors = {
  error: '16711680',
  warn: '16776960',
  info: '65280',
  log: '16777215',
};

@Injectable()
export class Notifier {
  private logger = new Logger();

  constructor(private config: ConfigService) {}

  async notify(notifyLevel: LogLevelName, message: string) {
    this.logger[notifyLevel](removeMarkdown(message));

    const notify = this.config.get('notify');

    if (!notify) {
      return;
    }

    this.notifySlack(notifyLevel, message);
    this.notifyDiscord(notifyLevel, message);
    this.notifyAdamant(notifyLevel, message);
  }

  async notifySlack(notifyLevel: LogLevelName, message: string) {
    const slack = this.config.get<string[]>('notify.slack');

    if (!slack) {
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
        await axios.post(slackApp, params);
      } catch (error) {
        this.logger.warn(
          `Request to Slack with message ${message} failed. ${error}.`,
        );
      }
    }
  }

  async notifyDiscord(notifyLevel: LogLevelName, message: string) {
    const threads = this.config.get<string[]>('notify.discord');

    if (!threads) {
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
        await axios.post(thread, params);
      } catch (error) {
        this.logger.warn(
          `Request to Discord with message '${message}' failed: ${error}.`,
        );
      }
    });

    return Promise.all(promises);
  }

  async notifyAdamant(notifyLevel: LogLevelName, message: string) {
    const addresses = this.config.get<string[]>('notify.adamant');
    const passphrase = this.config.get<string>('notify.adamantPassphrase');

    if (!addresses || !passphrase) {
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
          `Failed to send notification message '${formattedMessage}' to ${address}. ${error}.`,
        );
      }
    });

    return Promise.all(promises);
  }
}
