# RFS Activ Dashboard Auto-Login

This project automates the login process for the **RFS Activ Dashboard** using **Puppeteer**. It is designed to run on a **Raspberry Pi**, but can be adapted for other machines with modifications.

## Prerequisites

Ensure the following dependencies are installed **globally**:
- **Node.js**
- **npm**
- **Puppeteer**
- **dotenv**
- **Xvfb (Virtual Display)**

# Update package lists
```sh
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm
sudo apt install xvfb
```

# npm global modules
```sh
npm install -g puppeteer
npm install -g dotenv
```

## Setup Instructions

### 1. Clone the Repository
```sh
git clone git@github.com:tomgrant/rfs-activ-dashboard.git
cd your-repo
```

### 2. Install Dependencies
```sh
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the project root by using .env.example

> **Note:** A **private Activ account will not work** due to **2FA limitations**.

### 4. Running the Script
```sh
node login.js
```

## Running on Boot with Systemd
To start the script automatically on boot, use the **activ-login.service** file.

### 1. Modify `activ-login.service`
Update the following lines to match your setup:
```ini
ExecStart=/usr/bin/node /path/to/your/project/login.js
WorkingDirectory=/path/to/your/project
Environment="USER_DATA_PATH=/home/pi/chrome"
Environment="USERNAME=your-station-username"
Environment="PASSWORD=your-station-password"
```

### 2. Install the Service
copy the contents of activ-login.service to a new service file using nano.

```sh
nano ~/.config/systemd/user/activ-login.service
```

### 3. Enable and Start the Service
```sh
systemctl --user daemon-reload
systemctl --user enable activ-login.service
systemctl --user start activ-login.service
```

To check the service status:
```sh
systemctl --user status activ-login.service
```

## Notes
- The **USER_DATA_PATH** is where browser preferences are stored. Ensure it is a directory **with read/write access** (e.g., `/home/pi/chrome`).
- If running on a different OS, you may need to modify the **Puppeteer launch options**.
- The **ExecStart** and **WorkingDirectory** in the service file **must be updated** to match your installation path.

## Troubleshooting
- If the script **fails to log in**, ensure the credentials in the `.env` file are correct.
- If the **service does not start**, check logs with:
  ```sh
  journalctl --user -u activ-login.service --follow
  ```

