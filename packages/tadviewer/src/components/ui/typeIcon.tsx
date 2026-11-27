/*
 * A column type's mark, as the mock-up and the grid's header show it: 123,
 * # or A, or an icon for dates, times and booleans (which the mock-up
 * doesn't have).
 */
import * as React from "react";
import { Calendar, Check, Clock } from "./icons";

export const typeIcon = (kind: string): React.ReactNode => {
  switch (kind) {
    case "integer":
      return "123";
    case "real":
      return "#";
    case "boolean":
      return <Check size={11} strokeWidth={2} />;
    case "date":
      return <Calendar size={11} strokeWidth={1.8} />;
    case "time":
    case "datetime":
    case "timestamp":
      return <Clock size={11} strokeWidth={1.8} />;
    default:
      return "A";
  }
};
