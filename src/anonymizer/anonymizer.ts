import { IAnonymizer } from "../chat/types.js";
import { Config } from "../config/types.js";
import { SimpleWordAnonymizer } from "./simpleWordAnonymizer.js";


export function getAnonymizer(config: Config): IAnonymizer | undefined {
  if (config.anonymizer?.enabled) {
    return new SimpleWordAnonymizer(config.anonymizer.words);
  }
  return undefined;
}