#!/bin/bash

USERNAME="ec2-user"
PASSWORD=`openssl rand -base64 12`
echo $PASSWORD | sudo passwd --stdin $USERNAME > /dev/null
echo "Below is your unique password. Use it to connect to your Linux GUI (NICE DCV)"
echo "KEEP THIS SAFE! You can create a new password by repeating this process from RACE Service Workbench."
echo ""
echo "Username: $USERNAME"
echo "Password: $PASSWORD"