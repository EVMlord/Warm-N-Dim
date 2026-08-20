# Signing and releasing Warm N Dim

The installer is **unsigned** until a code-signing certificate is wired into CI. Windows SmartScreen will show “Windows protected your PC” / unknown publisher. Click **More info → Run anyway**. That is expected.

Never commit `.env`, `.pfx`, `.p12`, or passwords.

Signing does **not** instantly remove SmartScreen. Microsoft no longer grants immediate reputation to EV certificates. A new file hash starts at zero reputation even when signed; the warning fades after enough clean installs of the same publisher. Microsoft Store is the only path that skips SmartScreen entirely.

## Release (GitHub Actions)

Build and publish run on GitHub, not on a laptop.

1. Push the commits you want to ship (`dev` for a beta, `main` for stable).
2. Confirm `package.json` `version` and `CHANGELOG.md` match.
3. GitHub → **Actions** → **Release** → **Run workflow**.
4. Pick the branch that has that version. Leave **draft** unchecked unless you want a private draft first.

The workflow:

- Installs, tests, and builds the NSIS installer on `windows-latest`
- Creates tag `v<version>` on that commit if it does not already exist (so the tag is not created on `main` by accident)
- Publishes to GitHub Releases with `GITHUB_TOKEN` (no personal `GH_TOKEN` needed)
- Marks hyphenated versions (`0.4.0-beta.1`) as **Pre-release**; versions without a hyphen as **Latest**
- Pastes the matching `CHANGELOG.md` section into the release body

After it finishes, open https://github.com/EVMlord/Warm-N-Dim/releases and confirm:

- It is **not** a Draft
- A beta is marked **Pre-release**, and **Latest** still points at the last stable (currently 0.3.2)
- The installer, `.blockmap`, and `latest.yml` are attached

Anyone can then download:

`https://github.com/EVMlord/Warm-N-Dim/releases/download/v0.4.0-beta.1/WarmNDim-Setup-0.4.0-beta.1.exe`

Existing users who chose **Beta** in Controls → Updates (or tray **Include beta updates**) auto-update. Stable-channel users stay on Latest until you ship a non-hyphenated version.

## Channels

| `package.json` version | GitHub release | Who auto-updates |
| --- | --- | --- |
| `0.4.0-beta.1` (has a hyphen) | **Pre-release** | Users who chose **Beta** |
| `0.4.0` | Latest (stable) | Everyone |

`scripts/release.cjs` sets `EP_PRE_RELEASE=true` when the version has a hyphen. `package.json` → `build.publish.releaseType` is `"release"` so stable builds are published, not left as drafts.

To force a draft (local or Actions), set `EP_DRAFT=true` or check the workflow **draft** input. `EP_DRAFT` wins over the prerelease flag.

Do not publish a hyphenated version as Latest. Stable users would be offered the beta.

Stable users never downgrade off a beta they already installed; they wait for a stable version `>=` the running one.

## Local fallback

CI is the normal path. For a laptop publish, create a gitignored `.env`:

```ini
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Classic token: `repo` scope. Fine-grained: **Contents: Read and write** on this repo.

```bash
pnpm test
pnpm release
```

`pnpm release` loads `.env`, builds, and runs `electron-builder --publish always`. Hyphenated versions still become Pre-releases.

## Signing (not wired yet)

Leave this until after the unsigned 0.4.0-beta.1 is out. When you add it, keep **one** publisher identity forever — rotating certs resets SmartScreen reputation.

### Recommended later: Azure Artifact Signing

Cheapest option that does not need a USB token. ~$9.99/month (Basic). Individual identity validation is US/Canada only; organizations have a wider country list. Paid Azure subscription required (not free/trial).

electron-builder 26 config (do not add until the Azure account exists):

```json
"win": {
  "azureSignOptions": {
    "endpoint": "https://eus.codesigning.azure.net",
    "codeSigningAccountName": "your-account-name",
    "certificateProfileName": "your-profile-name",
    "publisherName": "Your Verified Name"
  }
}
```

CI env (or GitHub OIDC later): `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`. Then drop `CSC_IDENTITY_AUTO_DISCOVERY=false` from the workflow so signing actually runs.

Do **not** buy an EV certificate just to dodge SmartScreen — that instant-reputation behavior is gone.

### Optional OV certificate (file)

```ini
CSC_LINK=file:///C:/secure/certs/evmlord-code-signing.p12
CSC_KEY_PASSWORD=your_password
```

Then `pnpm release` (or add the same secrets to the Actions workflow). New OV certs from CAs usually require a hardware token or cloud HSM; a raw `.p12` email is uncommon now.

### Optional EV token (hardware)

Do **not** set `CSC_LINK`. In `package.json` → `build.win` set:

```json
"certificateSubjectName": "Your Company Name as it appears on the token"
```

## After the first signed build

1. Right-click the installer → Properties → Digital Signatures, or `signtool verify /pa /v WarmNDim-Setup-….exe`
2. Tell users a *new* hash may still show SmartScreen; **More info → Run anyway**
3. Optional: submit the installer to [Microsoft Security Intelligence](https://www.microsoft.com/wdsi/filesubmission) for malware false positives — that is **not** a SmartScreen whitelist
