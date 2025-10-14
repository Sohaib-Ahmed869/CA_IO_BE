"""
Simple CA IO Backend Health Check DAG
Uses Python script to run health checks for all environments
"""

from airflow import DAG
from airflow.operators.python_operator import PythonOperator
from airflow.operators.email_operator import EmailOperator
from datetime import datetime, timedelta
import subprocess
import json
import os

# Default arguments
default_args = {
    'owner': 'api-monitoring-team',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
    'email': ['admin@certified.io', 'devops@certified.io']
}

# Create DAG
dag = DAG(
    'simple_ca_io_health_check',
    default_args=default_args,
    description='Simple daily health check for CA IO Backend APIs',
    schedule_interval='0 12 * * *',  # Every day at 12 PM
    catchup=False,
    tags=['api', 'health-check', 'monitoring', 'simple']
)

def run_all_health_checks():
    """Run health checks for all environments"""
    
    # Change to the directory containing the health check script
    script_dir = '/opt/airflow/dags'  # Adjust this path as needed
    os.chdir(script_dir)
    
    # Run the health check script
    result = subprocess.run(['python3', 'run_health_checks.py'], 
                          capture_output=True, text=True, timeout=600)
    
    print("STDOUT:", result.stdout)
    print("STDERR:", result.stderr)
    
    # Check if summary report was created
    if os.path.exists('health_check_summary.json'):
        with open('health_check_summary.json', 'r') as f:
            summary = json.load(f)
        
        print(f"Health check completed: {summary['summary']['overall_status']}")
        
        # Return the summary for use in email notifications
        return summary
    else:
        raise Exception("Health check summary not generated")

def send_notification(**context):
    """Send email notification based on health check results"""
    
    summary = context['task_instance'].xcom_pull(task_ids='run_health_checks')
    
    if summary['summary']['overall_status'] == 'PASS':
        subject = f"✅ CA IO Backend Health Check PASSED - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        body = f"""
        <h2>✅ All Backend Environments Healthy</h2>
        <p>Health check completed successfully at {summary['timestamp']}</p>
        
        <h3>Environment Status:</h3>
        <ul>
        """
        
        for env in summary['environments']:
            body += f"<li>✅ {env['name']}: {env['status']}</li>"
        
        body += """
        </ul>
        
        <p>🎉 All systems are operational!</p>
        """
    else:
        subject = f"❌ CA IO Backend Health Check FAILED - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        body = f"""
        <h2>❌ Backend Health Check Failed</h2>
        <p>Health check completed at {summary['timestamp']}</p>
        
        <h3>Summary:</h3>
        <ul>
        <li>Total Environments: {summary['summary']['total_environments']}</li>
        <li>Passed: {summary['summary']['passed']}</li>
        <li>Failed: {summary['summary']['failed']}</li>
        </ul>
        
        <h3>Environment Status:</h3>
        <ul>
        """
        
        for env in summary['environments']:
            status_icon = "✅" if env['status'] == 'PASS' else "❌"
            body += f"<li>{status_icon} {env['name']}: {env['status']}</li>"
        
        body += """
        </ul>
        
        <p>🚨 Please check the Airflow logs for detailed error information.</p>
        <p>Health check reports are available in the DAG directory.</p>
        """
    
    # Send email
    email_op = EmailOperator(
        task_id='send_email_notification',
        to=['admin@certified.io', 'devops@certified.io'],
        subject=subject,
        html_content=body,
        dag=dag
    )
    
    return email_op.execute(context)

# Health check task
health_check_task = PythonOperator(
    task_id='run_health_checks',
    python_callable=run_all_health_checks,
    dag=dag
)

# Email notification task
email_task = PythonOperator(
    task_id='send_notification',
    python_callable=send_notification,
    provide_context=True,
    dag=dag
)

# Set task dependencies
health_check_task >> email_task
