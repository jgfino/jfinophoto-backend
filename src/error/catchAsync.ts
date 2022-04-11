import { NextFunction, Request, Response } from "express";

/**
 * Wraps a function to avoid using try-catch
 * @param fn The function to perform
 * @returns The wrapped function
 */
export const catchAsync = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};
