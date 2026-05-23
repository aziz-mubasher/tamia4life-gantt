import { handleBoard } from "../lib/handlers.js";

export default function handler(req, res) {
  return handleBoard(req, res, req.query?.id);
}
