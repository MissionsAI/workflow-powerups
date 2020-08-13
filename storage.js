import { promisify } from "util";
import redis from "redis";

const makeInstalledTeamKey = (teamId) => 
  `team-install-${teamId}`;
const makeUserCredentialKey = (teamId, userId) =>
  `user-credential-${teamId}:${userId}`;
const makeStepCredentialId = (workflowId, stepId) =>
  `step-credential-${workflowId}:${stepId}`;

export const initializeStorage = (redisURL) => {
  const redisClient = redis.createClient(process.env.REDIS_URL);
  redisClient.on("error", (error) => console.error(error));
  redisClient.on("connect", () => console.error("🙆‍♂️ Redis connected"));
  const redisGet = promisify(redisClient.get).bind(redisClient);
  const redisSet = promisify(redisClient.set).bind(redisClient);
  const redisZadd = promisify(redisClient.zadd).bind(redisClient);
  const redisZrangebyscore = promisify(redisClient.zrangebyscore).bind(redisClient);
  const redisZrem = promisify(redisClient.zrem).bind(redisClient);

  return {
    // saves a Bolt installed team object
    saveInstalledTeam: async (installation) => {
      const key = makeInstalledTeamKey(installation.team.id);
      const value = JSON.stringify(installation);
      return await redisSet(key, value);
    },

    // returns the whole Bolt installed team object
    getInstalledTeam: async (teamId) => {
      const key = makeInstalledTeamKey(teamId);
      const val = await redisGet(key);
      try {
        return JSON.parse(val);
      } catch (e) {
        console.error(`Error parsing ${key} from Redis:`, e.message);
        return null;
      }
    },

    // stores a user token for an install by a particular user of a team
    setUserCredential: async (teamId, userId, token) => {
      const key = makeUserCredentialKey(teamId, userId);
      return await redisSet(key, token);
    },

    // Get a user token for an install by a particular user of a team
    getUserCredential: async (teamId, userId) => {
      const key = makeUserCredentialKey(teamId, userId);
      return await redisGet(key);
    },

    setStepCredential: async (workflowId, stepId, teamId, userId) => {
      const key = makeStepCredentialId(workflowId, stepId);
      const stepCredential = { teamId, userId };

      await redisSet(key, JSON.stringify(stepCredential));

      return stepCredential;
    },

    getStepCredential: async (workflowId, stepId) => {
      const key = makeStepCredentialId(workflowId, stepId);
      const val = await redisGet(key);
      try {
        return JSON.parse(val);
      } catch (e) {
        console.error(`Error parsing ${key} from Redis:`, e.message);
        return null;
      }
    },

    // Add a schedule as a Redis sorted set. Schedules are scored in the set
    // using the unix time in milliseconds in the future. A random six digit number
    // is added to the end to decrease the liklihood of collisions. 
    addScheduled: async (scheduledSetKey, unixTime, val) => {
      const randSixDigitPadding = Math.floor(100000 + Math.random() * 900000)
      const score = `${unixTime}${randSixDigitPadding}`
      return await redisZadd(scheduledSetKey, score, val)
    },

    listScheduledBefore: async (scheduledSetKey, beforeUnixTime) => {
      const beforeScore = `${beforeUnixTime}999999`
      return await redisZrangebyscore(scheduledSetKey, 0, beforeScore)
    },

    completeScheduled: async (scheduledSetKey, val) => {
      return await redisZrem(scheduledSetKey, val)
    },
  };
};
