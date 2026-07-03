// SPDX-License-Identifier: GPL-3.0-or-later
import { FileService } from './file-service';

function fakeFile(name: string, text: string): File {
  return new File([text], name, { type: 'text/plain' });
}

describe('FileService', () => {
  it('open() reads text, strips BOM, detects EOL, returns handle', async () => {
    const file = fakeFile('a.ts', '﻿line1\r\nline2');
    const handle = {
      getFile: async () => file,
      name: 'a.ts',
    } as unknown as FileSystemFileHandle;
    const svc = new FileService({
      showOpenFilePicker: (async () => [handle]) as typeof window.showOpenFilePicker,
    });
    const res = await svc.open();
    expect(res?.name).toBe('a.ts');
    expect(res?.content).toBe('line1\r\nline2');
    expect(res?.bom).toBe(true);
    expect(res?.eol).toBe('crlf');
    expect(res?.size).toBe(file.size);
  });

  it('open() returns null when the picker is aborted', async () => {
    const svc = new FileService({
      showOpenFilePicker: (async () => {
        throw new DOMException('aborted', 'AbortError');
      }) as typeof window.showOpenFilePicker,
    });
    expect(await svc.open()).toBeNull();
  });

  it('saveTo() writes content with the chosen EOL and BOM via the handle', async () => {
    const writes: string[] = [];
    const handle = {
      createWritable: async () => ({
        write: async (data: string) => writes.push(data),
        close: async () => {},
      }),
    } as unknown as FileSystemFileHandle;
    const svc = new FileService({});
    await svc.saveTo(handle, 'a\nb', 'crlf', true);
    expect(writes[0]).toBe('﻿a\r\nb');
  });

  describe('ensureWritable', () => {
    it('returns true when queryPermission resolves to granted', async () => {
      const handle = {
        queryPermission: async () => 'granted',
      } as unknown as FileSystemFileHandle;
      const svc = new FileService({});
      expect(await svc.ensureWritable(handle)).toBe(true);
    });

    it('returns false when queryPermission is prompt and requestPermission is denied', async () => {
      const handle = {
        queryPermission: async () => 'prompt',
        requestPermission: async () => 'denied',
      } as unknown as FileSystemFileHandle;
      const svc = new FileService({});
      expect(await svc.ensureWritable(handle)).toBe(false);
    });

    it('returns true when queryPermission is absent (older browser / test fake)', async () => {
      const handle = {} as FileSystemFileHandle;
      const svc = new FileService({});
      expect(await svc.ensureWritable(handle)).toBe(true);
    });
  });
});
