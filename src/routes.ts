import { verifyGatewayRequest } from '@irshadkhan2019/job-app-shared';
import { Application } from 'express';


const BASE_PATH = '/api/v1/message';

const appRoutes = (app: Application): void => {
  app.use('', ()=>console.log("health"));
  app.use(BASE_PATH, verifyGatewayRequest, ()=>console.log("chat"));
};

export { appRoutes };