#!/bin/bash -xe

for run in {1..10}; do curl -s http://awsboo-LoadB-HeaH6CwHSRBH-1940533601.us-east-1.elb.amazonaws.com:80; done | sort | uniq -c