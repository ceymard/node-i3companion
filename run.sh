#!/bin/bash
cd ui && make && cd .. && node $@ srv/index.js