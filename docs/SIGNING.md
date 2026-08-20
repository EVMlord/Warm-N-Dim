# Signing and releasing Warm N Dim

The installer is **unsigned** until a code-signing certificate is configured. Windows SmartScreen will show “Windows protected your PC” / unknown publisher. That is expected.

Never commit `.env`, `.pfx`, `.p12`, or passwords.

## GitHub publish

`pnpm release` loads `.env` then runs `electron-builder --publish always`.

```ini
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

The token needs `repo` scope for [EVMlord/Warm-N-Dim](https://github.com/EVMlord/Warm-N-Dim).

## Optional OV certificate (file)

```ini
CSC_LINK=file:///C:/secure/certs/evmlord-code-signing.p12
CSC_KEY_PASSWORD=your_password
```

Then `pnpm release` as usual.

## Optional EV token (hardware)

Do **not** set `CSC_LINK`. In `package.json` → `build.win` set:

```json
"certificateSubjectName": "Your Company Name as it appears on the token"
```

## Channels

| `package.json` version | GitHub release | Who auto-updates |
| --- | --- | --- |
| `0.4.0-beta.1` (has a hyphen) | Must be a **Pre-release** | Users who chose **Beta** in Controls → Updates (or tray **Include beta updates**) |
| `0.4.0` | Latest (stable) | Everyone |

After publishing a beta, open the GitHub release and confirm it is marked **Pre-release**. If it is published as Latest, stable users may be offered the beta.

Stable users never downgrade off a beta they already installed; they wait for a stable version `>=` the running one.
