import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { textResult, type ToolFactory } from "./context.js";

export const communicationTools: ToolFactory = ({ chat }) => [
  defineTool({
    name: "say",
    label: "Say",
    description:
      "Send a message to the in-game chat. Use this to talk to players mid-task; your final text reply is also sent to chat automatically.",
    parameters: Type.Object({
      text: Type.String(),
    }),
    execute: (_id, p) => {
      chat.say(p.text);
      return Promise.resolve(textResult("Sent."));
    },
  }),
];
