#!/bin/bash
cd ui && make && cd .. && node --expose-gc $@ srv/index.js