.PHONY: dev install check-env

# Runs the backend (:8080) and frontend (:5173) dev servers together.
# Ctrl+C stops both. GOWORK=off avoids picking up any go.work file elsewhere
# on this machine that doesn't include this module.
dev: check-env frontend/node_modules
	@trap 'kill 0' EXIT INT TERM; \
	echo "Starting backend on :8080..."; \
	(cd backend && GOWORK=off go run .) & \
	echo "Starting frontend on :5173..."; \
	(cd frontend && npm run dev) & \
	wait

install: frontend/node_modules

frontend/node_modules:
	cd frontend && npm install

check-env:
	@test -f backend/.env || (echo "backend/.env not found. Run: cp backend/.env.example backend/.env, then add your Todoist token." >&2 && exit 1)
