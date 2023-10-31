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

Serverless Documentation
- https://www.serverless.com/framework/docs/getting-started/
- https://www.serverless.com/framework/docs/providers/aws/guide/intro

## API Locations ##
main/solution/backend/serverless.yml # Declares the backend service (API) and its configuration
main/solution/backend/config/infra/functions.yml # Referenced from serverless.yml - defines API lamdda functions and API
main/solution/backend/src/lambdas/api-handler/handler.js # The main API handler function
