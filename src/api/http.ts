import * as https from 'https';
import { RATE_LIMIT_MESSAGE } from '../cli/submitDiagnostics';

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export interface JsonRequest {
  method?: 'GET' | 'PATCH';
  token?: string;
  timeoutMs: number;
}

/** Sends an HTTPS request and parses the JSON reply. Rejects on non-2xx, oversized or invalid replies. */
export function requestJson(url: string, options: JsonRequest): Promise<any> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'exercism-workbench-vscode',
    };
    if (options.token) { headers['Authorization'] = `Bearer ${options.token}`; }

    const request = https.request(url, { method: options.method ?? 'GET', headers }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        // A reply this large is not Exercism data; stop reading instead of filling memory.
        if (size > MAX_RESPONSE_BYTES) {
          response.destroy(new Error(`The reply from ${url} was too large.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        const status = response.statusCode ?? 0;
        if (status === 429) { return reject(new Error(RATE_LIMIT_MESSAGE)); }
        if (status < 200 || status >= 300) { return reject(new Error(`HTTP ${status} from ${url}`)); }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error(`The reply from ${url} was not valid JSON.`));
        }
      });
    });
    request.on('error', reject);
    request.setTimeout(options.timeoutMs, () => request.destroy(new Error(`${url} did not answer in time.`)));
    request.end();
  });
}
