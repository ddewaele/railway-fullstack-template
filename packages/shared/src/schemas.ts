import { z } from "zod";

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  avatarUrl: z.url().nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const TodoSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(500),
  completed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Todo = z.infer<typeof TodoSchema>;

export const CreateTodoSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
});
export type CreateTodo = z.infer<typeof CreateTodoSchema>;

export const UpdateTodoSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    completed: z.boolean(),
  })
  .partial();
export type UpdateTodo = z.infer<typeof UpdateTodoSchema>;
