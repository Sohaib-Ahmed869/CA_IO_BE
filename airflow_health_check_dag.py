"""
CA IO Backend - Multi-Environment Health Check DAG
Runs health checks for EBC, Demo, and ETraining backends every day at 12 PM
"""

from airflow import DAG
from airflow.operators.bash_operator import BashOperator
from airflow.operators.python_operator import PythonOperator
from airflow.operators.email_operator import EmailOperator
from datetime import datetime, timedelta
import json
import os
import requests
import time

# Default arguments
default_args = {
    'owner': 'api-monitoring-team',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
    'email': ['iftikharazka1@gmail.com', 'azka.iftikhar@calcite.live']
}

# Create DAG
dag = DAG(
    'ca_io_backend_health_check',
    default_args=default_args,
    description='Daily health check for CA IO Backend APIs across all environments',
    schedule_interval='0 12 * * *',  # Every day at 12 PM
    catchup=False,
    tags=['api', 'health-check', 'monitoring']
)

# Environment configurations with credentials
ENVIRONMENTS = [
    {
        'name': 'EBC Backend',
        'env_file': 'ebc-backend-env.json',
        'base_url': 'https://ebcbackend.certified.io/api',
        'admin_email': 'admin@ebcbackend.certified.io',
        'admin_password': 'EBC_Admin_Password_123'
    },
    {
        'name': 'Demo Backend', 
        'env_file': 'demo-backend-env.json',
        'base_url': 'https://backendstaging.certified.io/api'
    },
    {
        'name': 'ETraining Backend',
        'env_file': 'etraining-backend-env.json', 
        'base_url': 'https://etrainingbackend.certified.io/api'
    }
]

def get_auth_tokens():
    """Get auth tokens for all environments by logging in"""
    
    tokens = {}
    
    for env in ENVIRONMENTS:
        env_name = env['name']
        base_url = env['base_url']
        email = env['admin_email']
        password = env['admin_password']
        
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
                    tokens[env_name] = token
                    print(f"✅ {env_name} auth token obtained successfully")
                else:
                    print(f"❌ {env_name} login failed: {result.get('message', 'Unknown error')}")
                    tokens[env_name] = None
            else:
                print(f"❌ {env_name} login failed with status {response.status_code}")
                tokens[env_name] = None
                
        except Exception as e:
            print(f"💥 {env_name} login error: {str(e)}")
            tokens[env_name] = None
        
        # Small delay between requests
        time.sleep(1)
    
    return tokens

def create_environment_files():
    """Create individual environment files for each backend with auth tokens"""
    
    # Get auth tokens first
    tokens = get_auth_tokens()
    
    # Base environment template
    base_env = {
        "id": "",
        "name": "",
        "values": [
            {
                "key": "base_url",
                "value": "",
                "type": "default",
                "enabled": True
            },
            {
                "key": "environment_name", 
                "value": "",
                "type": "default",
                "enabled": True
            },
            {
                "key": "auth_token",
                "value": "",
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
    
    # Create environment files with auth tokens
    for env in ENVIRONMENTS:
        env_config = base_env.copy()
        env_config["id"] = env["env_file"].replace('.json', '-env')
        env_config["name"] = env["name"]
        env_config["values"][0]["value"] = env["base_url"]
        env_config["values"][1]["value"] = env["name"]
        
        # Set auth token if available
        token = tokens.get(env["name"])
        if token:
            env_config["values"][2]["value"] = token  # auth_token is at index 2
            print(f"✅ {env['name']} environment file created with auth token")
        else:
            print(f"⚠️  {env['name']} environment file created without auth token")
        
        # Write environment file
        with open(f'/tmp/{env["env_file"]}', 'w') as f:
            json.dump(env_config, f, indent=2)
    
    print("Environment files created successfully")

def generate_health_report(**context):
    """Generate comprehensive health check report"""
    
    report = {
        'timestamp': datetime.now().isoformat(),
        'environments': []
    }
    
    # Collect results from each environment
    for env in ENVIRONMENTS:
        env_name = env["name"]
        result_file = f'/tmp/health_check_{env_name.lower().replace(" ", "_")}_results.json'
        
        if os.path.exists(result_file):
            with open(result_file, 'r') as f:
                result = json.load(f)
                report['environments'].append({
                    'name': env_name,
                    'status': 'SUCCESS' if result['run']['stats']['assertions']['failed'] == 0 else 'FAILED',
                    'details': result
                })
        else:
            report['environments'].append({
                'name': env_name,
                'status': 'FAILED',
                'details': {'error': 'Result file not found'}
            })
    
    # Write comprehensive report
    with open('/tmp/health_check_summary.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    return report

# Task to create environment files
create_env_files = PythonOperator(
    task_id='create_environment_files',
    python_callable=create_environment_files,
    dag=dag
)

# Health check tasks for each environment
health_check_tasks = []

for env in ENVIRONMENTS:
    env_name_clean = env["name"].lower().replace(" ", "_")
    
    health_check_task = BashOperator(
        task_id=f'health_check_{env_name_clean}',
        bash_command=f'''
        echo "Starting health check for {env["name"]}..."
        
        # Run Newman health checks
        newman run /opt/airflow/dags/postman_sanity_tests.json \
          -e /tmp/{env["env_file"]} \
          --reporters cli,json \
          --reporter-json-export /tmp/health_check_{env_name_clean}_results.json \
          --delay-request 1000 \
          --timeout-request 30000
        
        # Check if health check passed
        if [ $? -eq 0 ]; then
            echo "✅ {env["name"]} health check PASSED"
            exit 0
        else
            echo "❌ {env["name"]} health check FAILED"
            exit 1
        fi
        ''',
        dag=dag
    )
    
    health_check_tasks.append(health_check_task)
    create_env_files >> health_check_task

# Generate comprehensive report
generate_report = PythonOperator(
    task_id='generate_health_report',
    python_callable=generate_health_report,
    provide_context=True,
    dag=dag
)

# Email notification for failures
send_failure_email = EmailOperator(
    task_id='send_failure_notification',
    to=['admin@certified.io', 'devops@certified.io'],
    subject='🚨 CA IO Backend Health Check Failure - {{ ds }}',
    html_content='''
    <h2>🚨 CA IO Backend Health Check Failure</h2>
    <p>One or more backend environments failed health checks on {{ ds }}.</p>
    
    <h3>Failed Environments:</h3>
    <ul>
    {% for env in environments %}
        {% if env.status == 'FAILED' %}
        <li><strong>{{ env.name }}</strong> - {{ env.status }}</li>
        {% endif %}
    {% endfor %}
    </ul>
    
    <p>Please check the Airflow logs for detailed error information.</p>
    <p>Health check reports are available in /tmp/health_check_*_results.json</p>
    ''',
    dag=dag,
    trigger_rule='one_failed'
)

# Email notification for success
send_success_email = EmailOperator(
    task_id='send_success_notification',
    to=['admin@certified.io', 'devops@certified.io'],
    subject='✅ CA IO Backend Health Check Success - {{ ds }}',
    html_content='''
    <h2>✅ CA IO Backend Health Check Success</h2>
    <p>All backend environments passed health checks on {{ ds }}.</p>
    
    <h3>Environment Status:</h3>
    <ul>
    {% for env in environments %}
        <li><strong>{{ env.name }}</strong> - {{ env.status }}</li>
    {% endfor %}
    </ul>
    
    <p>All systems are operational! 🎉</p>
    ''',
    dag=dag,
    trigger_rule='all_success'
)

# Set up task dependencies
for task in health_check_tasks:
    task >> generate_report

generate_report >> [send_failure_email, send_success_email]
