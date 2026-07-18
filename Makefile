.PHONY: dev restart stop logs install check-env

LOG_DIR := .logs
BACKEND_PORT := 8080
FRONTEND_PORT := 5173

# Runs the backend (:8080) and frontend (:5173) dev servers together in the
# foreground. Ctrl+C stops both. GOWORK=off avoids picking up any go.work file
# elsewhere on this machine that doesn't include this module.
dev: check-env frontend/node_modules
	@trap 'kill 0' EXIT INT TERM; \
	echo "Starting backend on :$(BACKEND_PORT)..."; \
	(cd backend && GOWORK=off go run .) & \
	echo "Starting frontend on :$(FRONTEND_PORT)..."; \
	(cd frontend && npm run dev) & \
	wait

# Runs both servers in the background, logging to .logs/. Kills whatever's
# already bound to their ports first, so it's safe to run again after every
# change without worrying whether a previous run is still up.
restart: stop check-env frontend/node_modules
	@mkdir -p $(LOG_DIR)
	@echo "Starting backend on :$(BACKEND_PORT) (log: $(LOG_DIR)/backend.log)..."
	@(cd backend && GOWORK=off nohup go run . > ../$(LOG_DIR)/backend.log 2>&1 &)
	@echo "Starting frontend on :$(FRONTEND_PORT) (log: $(LOG_DIR)/frontend.log)..."
	@(cd frontend && nohup npm run dev > ../$(LOG_DIR)/frontend.log 2>&1 &)
	@echo "Running in background. 'make stop' to stop, 'make logs' to tail output."

# Kills whatever is listening on the dev ports, if anything. Killing by port
# (rather than a saved PID) matters here: both `go run .` and `npm run dev`
# spawn a child process that does the actual listening, so killing only the
# wrapper PID would leave an orphaned server running and block the port.
stop:
	@-lsof -ti:$(BACKEND_PORT) | xargs kill 2>/dev/null; true
	@-lsof -ti:$(FRONTEND_PORT) | xargs kill 2>/dev/null; true
	@sleep 1

logs:
	@tail -f $(LOG_DIR)/backend.log $(LOG_DIR)/frontend.log

install: frontend/node_modules

frontend/node_modules:
	cd frontend && npm install

check-env:
	@test -f backend/.env || (echo "backend/.env not found. Run: cp backend/.env.example backend/.env, then add your Todoist token." >&2 && exit 1)
