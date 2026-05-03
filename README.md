# Alteon ADC Demo Webapp

This is a demo web application for showcasing Alteon ADC functionalities in a lab environment.

## Setup

1. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Run the main controller app:
   ```
   python controller.py
   ```
   This starts on http://localhost:5000

3. Run the post-ADC app:
   ```
   python post_adc.py
   ```
   This starts on http://localhost:5001

## Usage

- Open http://localhost:5000 in your browser.
- Use the DNS lookup to see A records.
- Click scenario buttons to simulate executions.
- For header injection, visit the post-ADC app link to see request details.

## Scenarios

- DNS Lookup
- HTTP Header Injection
- HTTP Body Modification
- Compression Offloading
- Content Based Load Balancing
- HTTP2 Gateway
- Advanced Analytics

## Architecture

- Controller app: Main dashboard and scenario execution.
- Post-ADC app: Displays request details after ADC processing.