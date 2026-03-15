/**
 * @jacbot/cli
 *
 * Command-line interface for Jacbot.
 *
 * Commands:
 *   jacbot init              — Initialize a new project
 *   jacbot agent add         — Register an agent
 *   jacbot task create       — Create a task
 *   jacbot task list         — List tasks with status
 *   jacbot run               — Dispatch ready tasks to agents
 *   jacbot status            — Show project overview
 *   jacbot recall <query>    — Query agent memory
 *   jacbot waves             — Show dependency waves
 */

export { run } from './cli.js';
