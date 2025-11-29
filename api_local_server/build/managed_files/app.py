
from flask import Flask, render_template
import datetime

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/time')
def get_current_time():
    now = datetime.datetime.now()
    return {"time": now.strftime("%H:%M:%S")}

if __name__ == '__main__':
    app.run(debug=True,port=8888)
