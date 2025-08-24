import { Config } from "../config.js";
import { SimpleWordAnonymizer } from "./simpleWordAnonymizer.js";

export interface Anonymizer {
    anonymize(text: string): string;
    deanonymize(text: string): string;
}

export function getAnonymizer(config: Config): Anonymizer | undefined {
  if (config.anonymizer?.enabled) {
    return new SimpleWordAnonymizer(config.anonymizer.words);
  }
  return undefined;
}