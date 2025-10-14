#!/usr/bin/env python3
"""
CA IO Backend Health Check Runner
Runs health checks for all environments using Newman
"""

import subprocess
import json
import os
import sys
import requests
import time
from datetime import datetime

# Environment configurations with credentials
ENVIRONMENTS = [
    {
        'name': 'EBC Backend',
        'base_url': 'https://ebcbackend.certified.io/api',
        'env_file': 'ebc-backend-env.json',
        'admin_email': 'admin@ebcbackend.certified.io',
        'admin_password': 'EBC_Admin_Password_123'
    },
    {
        'name': 'Demo Backend',
        'base_url': 'https://backendstaging.certified.io/api', 
        'env_file': 'demo-backend-env.json',
        'admin_email': 'admin@backendstaging.certified.io',
        'admin_password': 'Demo_Admin_Password_123'
    },
    {
        'name': 'ETraining Backend',
        'base_url': 'https://etrainingbackend.certified.io/api',
        'env_file': 'etraining-backend-env.json',
        'admin_email': 'admin@etrainingbackend.certified.io',
        'admin_password': 'ETraining_Admin_Password_123'
    }
]

def get_auth_token(env_config):
    """Get auth token for a specific environment by logging in"""
    
    env_name = env_config['name']
    base_url = env_config['base_url']
    email = env_config['admin_email']
    password = env_config['admin_password']
    
    print(f"🔐 Getting auth token for {env_name}...")
    
    try:
        # Login to get token
        login_url = f"{base_url}/auth/login"
        login_data = {
            "email": email,
            "password": password
        }
        
        response = requests.post(
            login_url,
            json=login_data,
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success') and result.get('data', {}).get('token'):
                token = result['data']['token']
                print(f"✅ {env_name} auth token obtained successfully")
                return token
            else:
                print(f"❌ {env_name} login failed: {result.get('message', 'Unknown error')}")
                return None
        else:
            print(f"❌ {env_name} login failed with status {response.status_code}")
            return None
            
    except Exception as e:
        print(f"💥 {env_name} login error: {str(e)}")
        return None

def create_environment_file(env_config):
    """Create environment file for Newman with auth token"""
    
    # Get auth token first
    auth_token = get_auth_token(env_config)
    
    env_data = {
        "id": env_config['env_file'].replace('.json', '-env'),
        "name": env_config['name'],
        "values": [
            {
                "key": "base_url",
                "value": env_config['base_url'],
                "type": "default",
                "enabled": True
            },
            {
                "key": "environment_name",
                "value": env_config['name'],
                "type": "default", 
                "enabled": True
            },
            {
                "key": "auth_token",
                "value": auth_token or "",
                "type": "secret",
                "enabled": True
            },
            {
                "key": "user_id",
                "value": "",
                "type": "default",
                "enabled": True
            },
            {
                "key": "user_type",
                "value": "",
                "type": "default",
                "enabled": True
            },
            {
                "key": "certification_id",
                "value": "",
                "type": "default",
                "enabled": True
            },
            {
                "key": "application_id",
                "value": "",
                "type": "default",
                "enabled": True
            },
            {
                "key": "health_check_time",
                "value": "",
                "type": "default",
                "enabled": True
            },
            {
                "key": "health_check_status",
                "value": "",
                "type": "default",
                "enabled": True
            },
            {
                "key": "health_check_response_time",
                "value": "",
                "type": "default",
                "enabled": True
            },
            {
                "key": "health_check_certifications",
                "value": "",
                "type": "default",
                "enabled": True
            }
        ],
        "_postman_variable_scope": "environment"
    }
    
    # Write environment file
    with open(env_config['env_file'], 'w') as f:
        json.dump(env_data, f, indent=2)
    
    if auth_token:
        print(f"✅ Created environment file: {env_config['env_file']} with auth token")
    else:
        print(f"⚠️  Created environment file: {env_config['env_file']} without auth token")

def run_health_check(env_config):
    """Run health check for a specific environment"""
    
    env_name_clean = env_config['name'].lower().replace(' ', '_')
    output_file = f"health_check_{env_name_clean}_results.json"
    
    print(f"\n🔍 Running health check for {env_config['name']}...")
    print(f"   URL: {env_config['base_url']}")
    
    try:
        # Run Newman command
        cmd = [
            'newman', 'run', 'postman_sanity_tests.json',
            '-e', env_config['env_file'],
            '--reporters', 'cli,json',
            '--reporter-json-export', output_file,
            '--delay-request', '1000',
            '--timeout-request', '30000'
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        # Check if Newman command succeeded
        if result.returncode == 0:
            print(f"✅ {env_config['name']} health check PASSED")
            
            # Parse results for summary
            if os.path.exists(output_file):
                with open(output_file, 'r') as f:
                    results = json.load(f)
                    stats = results.get('run', {}).get('stats', {})
                    assertions = stats.get('assertions', {})
                    
                    print(f"   📊 Tests: {assertions.get('total', 0)} total, {assertions.get('failed', 0)} failed")
                    print(f"   ⏱️  Duration: {stats.get('testScripts', {}).get('duration', 0)}ms")
            
            return True
        else:
            print(f"❌ {env_config['name']} health check FAILED")
            print(f"   Error: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        print(f"⏰ {env_config['name']} health check TIMEOUT (5 minutes)")
        return False
    except Exception as e:
        print(f"💥 {env_config['name']} health check ERROR: {str(e)}")
        return False

def generate_summary_report(results):
    """Generate summary report"""
    
    timestamp = datetime.now().isoformat()
    
    report = {
        'timestamp': timestamp,
        'summary': {
            'total_environments': len(results),
            'passed': sum(1 for r in results.values() if r),
            'failed': sum(1 for r in results.values() if not r),
            'overall_status': 'PASS' if all(results.values()) else 'FAIL'
        },
        'environments': []
    }
    
    for env_name, status in results.items():
        report['environments'].append({
            'name': env_name,
            'status': 'PASS' if status else 'FAIL'
        })
    
    # Write summary report
    with open('health_check_summary.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"🎯 HEALTH CHECK SUMMARY - {timestamp}")
    print(f"{'='*60}")
    print(f"📊 Overall Status: {report['summary']['overall_status']}")
    print(f"📈 Passed: {report['summary']['passed']}/{report['summary']['total_environments']}")
    print(f"📉 Failed: {report['summary']['failed']}/{report['summary']['total_environments']}")
    print(f"\nEnvironment Details:")
    
    for env in report['environments']:
        status_icon = "✅" if env['status'] == 'PASS' else "❌"
        print(f"  {status_icon} {env['name']}: {env['status']}")
    
    print(f"{'='*60}")
    
    return report

def main():
    """Main function"""
    
    print("🚀 CA IO Backend Health Check Runner")
    print("=" * 50)
    
    # Check if Newman is installed
    try:
        subprocess.run(['newman', '--version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ Newman is not installed or not in PATH")
        print("   Install with: npm install -g newman")
        sys.exit(1)
    
    # Check if collection file exists
    if not os.path.exists('postman_sanity_tests.json'):
        print("❌ postman_sanity_tests.json not found")
        print("   Make sure you're running this script from the correct directory")
        sys.exit(1)
    
    # Create environment files
    for env in ENVIRONMENTS:
        create_environment_file(env)
    
    # Run health checks
    results = {}
    
    for env in ENVIRONMENTS:
        success = run_health_check(env)
        results[env['name']] = success
    
    # Generate summary report
    summary = generate_summary_report(results)
    
    # Exit with appropriate code
    if summary['summary']['overall_status'] == 'PASS':
        print("\n🎉 All health checks passed!")
        sys.exit(0)
    else:
        print("\n💥 Some health checks failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
