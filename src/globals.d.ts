// SPDX-License-Identifier: GPL-3.0-or-later

// Minimal ambient declarations for the File System Access API options actually
// used by FileService. Kept to the spec-accurate fields to avoid misleading
// future callers; merges additively if lib.dom later ships these.
type FilePickerAcceptType = { description?: string; accept?: Record<string, string[]> };

type OpenFilePickerOptions = {
  types?: FilePickerAcceptType[];
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
};

type SaveFilePickerOptions = {
  types?: FilePickerAcceptType[];
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
};

type FileSystemPermissionMode = 'read' | 'readwrite';
type FileSystemPermissionDescriptor = { mode: FileSystemPermissionMode };
type PermissionState = 'granted' | 'denied' | 'prompt';

declare global {
  interface Window {
    showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  }

  interface FileSystemFileHandle {
    queryPermission?(descriptor: FileSystemPermissionDescriptor): Promise<PermissionState>;
    requestPermission?(descriptor: FileSystemPermissionDescriptor): Promise<PermissionState>;
  }
}

export {};
