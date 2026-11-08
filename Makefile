PYTHON ?= python3
VENV := .venv
VENV_PYTHON := $(VENV)/bin/python
TUI_DEPS := $(VENV)/.tui-deps
NODE_DEPS := node_modules/.realbook-deps

.PHONY: help setup tui tui-check legacy-tui personal-openbook validate build web clean

help:
	@echo "Realbook Strudel commands:"
	@echo "  make setup       Install Node and Textual TUI dependencies"
	@echo "  make tui         Run the mouse-enabled Textual TUI"
	@echo "  make tui-check   Validate the Textual TUI song catalog"
	@echo "  make legacy-tui  Run the previous Ink TUI"
	@echo "  make personal-openbook  Download and convert OpenBook into ignored local files"
	@echo "  make validate    Validate all song JSON files"
	@echo "  make build       Type-check and build the web application"
	@echo "  make web         Start the web development server"

$(NODE_DEPS): package.json package-lock.json
	npm install
	touch $@

$(TUI_DEPS): tools/requirements-tui.txt
	$(PYTHON) -m venv $(VENV)
	$(VENV_PYTHON) -m pip install -r tools/requirements-tui.txt
	touch $@

setup: $(NODE_DEPS) $(TUI_DEPS)

tui: $(NODE_DEPS) $(TUI_DEPS)
	$(VENV_PYTHON) tools/tui.py

tui-check: $(TUI_DEPS)
	$(VENV_PYTHON) tools/tui.py --check

legacy-tui: $(NODE_DEPS)
	npm run tui:legacy

personal-openbook:
	$(PYTHON) tools/import_openbook_personal.py

validate: $(NODE_DEPS)
	npm run validate:songs

build: $(NODE_DEPS)
	npm run build

web: $(NODE_DEPS)
	npm run dev

clean:
	rm -rf $(VENV)
