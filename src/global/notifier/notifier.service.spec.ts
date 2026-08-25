import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Notifier } from './notifier.service';
import { api } from './adamant/api';

jest.mock('axios');
jest.mock('./adamant/api', () => ({
  api: {
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
  },
}));

describe('Notifier Service', () => {
  let notifier: Notifier;
  let mockConfigService: Partial<ConfigService>;
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigService = {
      get: jest.fn((key: string) => {
        const configMap: Record<string, any> = {
          name: 'CurrencyinfoTest',
          'notify.slack': ['https://hooks.slack.com/services/T00/B00/XXX'],
          'notify.discord': ['https://discord.com/api/webhooks/123/XYZ'],
          'notify.adamant': ['U1234567890123456789'],
          'notify.adamantPassphrase':
            'apple banana cherry dragon elephant fox gorilla hawk iguana jaguar',
          notify: true,
        };
        return configMap[key];
      }),
    };

    notifier = new Notifier(mockConfigService as ConfigService);
  });

  it('should dispatch notification to all configured channels', async () => {
    mockedAxios.post.mockResolvedValue({ data: 'ok' });

    await notifier.notify('warn', 'Test warning message');

    expect(mockedAxios.post).toHaveBeenCalledTimes(2); // Slack and Discord
    expect(api.sendMessage).toHaveBeenCalledWith(
      'apple banana cherry dragon elephant fox gorilla hawk iguana jaguar',
      'U1234567890123456789',
      expect.stringContaining('Test warning message'),
    );
  });

  it('should format Slack payload with appropriate color and markdown', async () => {
    mockedAxios.post.mockResolvedValue({ data: 'ok' });

    await notifier.notifySlack('error', '**Critical** issue');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/T00/B00/XXX',
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            color: '#FF0000',
            text: '*Critical* issue',
          }),
        ],
      }),
      { timeout: 10000 },
    );
  });

  it('should format Discord payload with embed color', async () => {
    mockedAxios.post.mockResolvedValue({ data: 'ok' });

    await notifier.notifyDiscord('info', 'Service updated');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/123/XYZ',
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            color: '3581775',
            description: 'Service updated',
          }),
        ],
      }),
      { timeout: 10000 },
    );
  });

  it('should handle errors gracefully without throwing', async () => {
    mockedAxios.post.mockRejectedValue(new Error('Network error'));
    (api.sendMessage as jest.Mock).mockResolvedValue({ success: false, error: 'ADM node down' });

    await expect(notifier.notify('error', 'Failing notification')).resolves.not.toThrow();
  });
});
