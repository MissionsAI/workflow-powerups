# Slack Workflow Builder Power-Ups
A collection of simple Workflow Builder extensions (aka Steps from Apps) to serve as examples and be useful in their own right. 

![under construction](https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fmondrian.mashable.com%2Fuploads%25252Fcard%25252Fimage%25252F168421%25252Ftumblr_ks4m18IymX1qz4u07o1_250.gif%25252Ffull-fit-in__950x534.gif%3Fsignature%3DQmYdcxMZN9xRJEWdrQIXh3KiiUQ%3D%26source%3Dhttps%253A%252F%252Fblueprint-api-production.s3.amazonaws.com&f=1&nofb=1)


## Configuration
To run locally you'll need a `.env` file with these properties:

```
export SLACK_SIGNING_SECRET=
export SLACK_CLIENT_ID=
export SLACK_CLIENT_SECRET=
export STATE_SECRET=
export HOST=https://host
export REDIS_URL=redis://127.0.0.1:6379
```

And then to run with nodemon: `npm run-script dev`