# Signing ValHelpTracker.exe

CI is already set up to sign the tracker (`tracker` job in `.github/workflows/main_valhelp.yml`). The signing steps are skipped until the repo variables below are set, so the exe ships unsigned until then and https://valheim.help/tracker shows the SmartScreen note.

Service: **Azure Artifact Signing** (formerly Trusted Signing), Basic plan, about $9.99/month.

## Steps

1. **Create the signing account.** In the Azure portal, create an *Artifact Signing* account in the same subscription as the web app. Note its region's endpoint, e.g. `https://eus.codesigning.azure.net/` for East US.
2. **Validate your identity.** In the account, request identity validation (Public Trust). Check that validation for individuals is offered where you live. Approval can take a few days.
3. **Create a certificate profile.** Choose type *Public Trust* and link it to the validated identity. Note the profile name.
4. **Grant the role.** On the signing account, assign **Artifact Signing Certificate Profile Signer** to the app registration the deploy job logs in with: the client ID in the secret `AZUREAPPSERVICE_CLIENTID_966B…`.
5. **Add a federated credential.** On that app registration, under *Certificates & secrets*, then *Federated credentials*, add one for GitHub Actions with repo `jarrettv/ValHelp`, entity type *Branch*, branch `main`. The existing credential is probably for the `Production` environment, and the tracker job doesn't run in that environment.
6. **Set the repo variables.** In GitHub, under *Settings*, then *Secrets and variables*, then *Actions*, then *Variables*, add these three. Use *Variables*, not *Secrets*:
   - `SIGNING_ENDPOINT`: the endpoint from step 1
   - `SIGNING_ACCOUNT`: the account name
   - `SIGNING_PROFILE`: the certificate profile name
7. **Push to `main` and check the result:**
   - The *Sign tracker* step ran and passed.
   - https://valheim.help/downloads/ValHelpTracker.json shows `"signed": true` and a `signer`.
   - The `/tracker` page no longer shows the unsigned note and says who signed the build.
   - Locally, `Get-AuthenticodeSignature .\ValHelpTracker.exe` reports `Valid`.

## Notes

- Even signed builds can still trigger a SmartScreen warning until enough people have downloaded them.
- **Free alternative:** the [SignPath Foundation](https://signpath.org/) program for open-source projects. The repo is public and GPL-3.0, so it likely qualifies. The certificate names SignPath Foundation as the publisher, it requires origin verification and multi-factor login, and the project has to show an attribution line. Switching would mean replacing the *Sign tracker* step with SignPath's GitHub action.
- When the tracker changes what it reads, sends or writes, update the safety report in `web/src/TrackerDownload.tsx` (and its `REVIEWED` date) and the About text in `Tray.cs`.
