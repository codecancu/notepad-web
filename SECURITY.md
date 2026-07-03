# Security Policy

## Supported Versions

Only the latest released version is supported with security fixes.

## Reporting a Vulnerability

Report vulnerabilities via **GitHub private security advisories** on this repository.
Do not open a public issue for security problems.

Navigate to the **Security** tab of this repository and select **Report a vulnerability**
to open a private advisory. You will receive a response within 7 days.

## Scope

Notepad Web makes no network requests and stores data only in the local browser
(IndexedDB, chrome.storage.local, File System Access API). The attack surface is
limited to malicious file content and extension permission misuse.
