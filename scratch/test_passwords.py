import subprocess

passwords = ['', 'root', 'DevPassword123!', 'admin', 'password', '123456', '12345678', 'mysql', 'engcode', '1234', 'root1234', 'Root1234!']
mysql_path = r'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'

for p in passwords:
    if p == '':
        cmd = [mysql_path, '-u', 'root', '--skip-password', '-e', 'SHOW DATABASES;']
    else:
        cmd = [mysql_path, '-u', 'root', f'--password={p}', '-e', 'SHOW DATABASES;']
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0:
        print(f'SUCCESS! Password is: "{p}"')
        print('Databases found:')
        print(res.stdout)
        break
    else:
        print(f'Failed for password: "{p}" -> {res.stderr.strip()}')
