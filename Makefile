EXECUTABLE := collate

###############
##@ Development

.PHONY: all
all: fmt lint test build

.PHONY: dev
dev: ## Run the app in development mode
	@$(MAKE) --no-print-directory log-$@
	cargo tauri dev

.PHONY: build
build: ## Build the application
	@$(MAKE) --no-print-directory log-$@
	cargo tauri build

.PHONY: build-debug
build-debug: ## Build the application in debug mode
	@$(MAKE) --no-print-directory log-$@
	cargo tauri build --debug

.PHONY: fmt
fmt: ## Check formatting (Rust + TypeScript)
	@$(MAKE) --no-print-directory log-$@
	@cargo fmt --check --manifest-path src-tauri/Cargo.toml
	@pnpm prettier --check src/

.PHONY: fmt-fix
fmt-fix: ## Apply formatting fixes (Rust + TypeScript)
	@$(MAKE) --no-print-directory log-$@
	@cargo fmt --manifest-path src-tauri/Cargo.toml
	@pnpm prettier --write src/

.PHONY: lint
lint: ## Lint the project (Rust + TypeScript)
	@$(MAKE) --no-print-directory log-$@
	@cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
	@pnpm tsc --noEmit

.PHONY: test
test: ## Execute tests (Rust + frontend)
	@$(MAKE) --no-print-directory log-$@
	@cargo test --manifest-path src-tauri/Cargo.toml
	@pnpm test

.PHONY: test-rust
test-rust: ## Execute Rust tests only
	@$(MAKE) --no-print-directory log-$@
	cargo test --manifest-path src-tauri/Cargo.toml

.PHONY: test-frontend
test-frontend: ## Execute frontend tests only
	@$(MAKE) --no-print-directory log-$@
	pnpm test

.PHONY: clean
clean: ## Clean build artifacts
	@$(MAKE) --no-print-directory log-$@
	@cargo clean --manifest-path src-tauri/Cargo.toml
	@rm -rf src-tauri/target/

.PHONY: install
install: ## Install frontend dependencies
	@$(MAKE) --no-print-directory log-$@
	pnpm install

.PHONY: tools
tools: ## Install tools needed for development
	@$(MAKE) --no-print-directory log-$@
	@cargo install tauri-cli --version "^2"
	@pnpm install

###############
##@ Release

.PHONY: snapshot
snapshot: ## Build a snapshot release locally
	@$(MAKE) --no-print-directory log-$@
	cargo tauri build --debug

###########################################################################
## Self-Documenting Makefile Help and logging                            ##
## https://github.com/terraform-docs/terraform-docs/blob/master/Makefile ##
## https://marmelab.com/blog/2016/02/29/auto-documented-makefile.html    ##
###########################################################################

########
##@ Help

.PHONY: help
help:   ## Display this help
	@awk \
		-v "col=\033[36m" -v "nocol=\033[0m" \
		' \
			BEGIN { \
				FS = ":.*##" ; \
				printf "Usage:\n  make %s<target>%s\n", col, nocol \
			} \
			/^[a-zA-Z_-]+:.*?##/ { \
				printf "  %s%-15s%s %s\n", col, $$1, nocol, $$2 \
			} \
			/^##@/ { \
				printf "\n%s%s%s\n", nocol, substr($$0, 5), nocol \
			} \
		' $(MAKEFILE_LIST)

log-%:
	@grep -h -E '^$*:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk \
			'BEGIN { \
				FS = ":.*?## " \
			}; \
			{ \
				printf "\033[36m==> %s\033[0m\n", $$2 \
			}'
