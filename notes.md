You need to run babel to watch and compile changes when running the local UI.
Run the dev UI and backend

Backend:
> cd main/solution/backend
> pnpx sls offline -s $STAGE

Frontend:
> cd main/solution/ui
> pnpx sls start-ui -s $STAGE

In each of the following directories:
> cd /mnt/git/swb/addons/addon-base-ui/packages/base-ui
> cd /mnt/git/swb/addons/addon-base-raas-ui/packages/base-raas-ui

Run the following command:
> pnpm run babel:watch

This will ensure that code changes are immediately compiled and updated in the UI
