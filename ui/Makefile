color=$(shell echo "\033[0;32m")
reset=$(shell echo "\033[0m")

FLAGS = --bundle --error-limit=0 --platform=browser --target=es2017 --define:'process.env.NODE_ENV="production"'

.PHONY: all clean appjs appjsminified appjswatch sass

# Par défaut, on construit le code de débug
all: appjs sass

sass:
	./node_modules/.bin/sass styles/main.sass:styles/main.css

sass-watch:
	./node_modules/.bin/sass --watch styles/main.sass:styles/main.css


# Nuke du __dist, on repart de zéro.
clean:
	rm -rf lib/*

# Pour un build de dev
appjs:
	esbuild $(FLAGS) --sourcemap --outfile=lib/app.js src/main.tsx
	echo app.js rebuilt.

# Pour le build docker
appjsminified:
	rm -f $(CLIENT_DIST)/app.js.map
	esbuild $(FLAGS) --minify --outfile=lib/app.js src/main.tsx

appjswatch: staticassets
	tsc --noEmit -w | wtsc make -s appjs
