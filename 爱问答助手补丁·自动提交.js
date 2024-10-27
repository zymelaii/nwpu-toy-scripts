// ==UserScript==
// @name         爱问答助手补丁·自动提交
// @namespace    http://tampermonkey.net/
// @version      2024-10-27
// @description  爱问答助手补丁·自动提交，仅适用于超星通章节测验
// @author       Zymelaii Ryer <melaiiryer@gmail.com>
// @match        https://mooc1.chaoxing.com/mycourse/studentstudy*
// @icon         data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAAXNSR0IArs4c6QAAAHVQTFRFR3BMgICBQD8/QUVHQ0ZIRUhKX2FiQD8/Tk1NP0VJPzs7Pz8/QD4+UE9QQD8/PVlnQD8/M6vj////n5+fN5C60NDQSl9qOXWSZL/qTFNXzOr4QWl8yMjItLS02traOIOnNZzN6OfnlJeZ9/f3PYGgpdrzmdXxgSBJqQAAABB0Uk5TAP5E6vys+7/Q0RhsfPFV/OwFarYAAAEESURBVHjapdHrboMgGIBhUHBaD/sAlTE8VOt2/5c4GlBMRZOl7w8j+kQQ0FaVwbG48IDq+piMPcgkO1bD/8DXvhD4/fb9ePDuGiqa2krV7pO1AxSLYIl2ABoeTLSvYMBi4N0sphOAlVaqg1aTPggmZYYaFvNMBYGQz6G6m2vbhEBvF81MxALFTDpbQQd3ZhvBgxqiFfBEO/CJ7ZxkNPcUbWBwn5DJw4KSsJHcHPCTLLDuQxpLkiMLbAIWJs1wBRVkyAFXT7Sa+AYQjTywNfOD74DNA18I9Ifjpg7Es/3Jj5eKyIEcBgNwhk5L8XMPonMQQcfNhBfRpIfbFbiRskCX5enFyz/07TSN9vGxKwAAAABJRU5ErkJggg==
// @grant        none
// @license      MIT
// ==/UserScript==

function delay(timeout) {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
}

async function waitUntil(acquire, delayMs) {
    let result = acquire();
    while (result === null) {
        await delay(delayMs);
        result = acquire();
    }
    return result;
}

function try_get_complete_answer(document) {
    let questions = document.querySelectorAll('.singleQuesId');
    let has_unanswered = false;
    let cur_ans = {}
    for (let q of questions) {
        let q_ans = []
        let choices = q.querySelectorAll('ul span')
        for (let c of choices) {
            if (c.classList.contains('num_option') && c.classList.contains('check_answer')) {
                q_ans.push(c.textContent);
            } else if (c.classList.contains('num_option_dx') && c.classList.contains('check_answer_dx')) {
                q_ans.push(c.textContent);
            } else {
                //! unknown type of choice, ignore it
            }
        }
        if (q_ans.length == 0) {
            has_unanswered = true;
        }
        cur_ans[q.attributes['data'].textContent] = q_ans;
    }
    return has_unanswered ? null : JSON.stringify(cur_ans);
}

async function wait_iframe(owner, selector) {
    let loaded = false;
    let frame = await waitUntil(() => owner.querySelector(selector), 100);
    frame.addEventListener("load", (e) => {
        loaded = true;
    });
    await waitUntil(() => loaded || null, 100);
    return frame;
}

(async function setup() {
    await waitUntil(() => document.querySelector('div.chapter'), 10);
    let task_list = await waitUntil(() => {
        let tasks = document.querySelectorAll('div.posCatalog_select:not(.firstLayer)');
        if (tasks.length == 0) { return null; }
        return tasks;
    }, 100);

    let finished_tasks = new Set;
    let tasks = new Array;
    for (let task of task_list) {
        if (task.querySelector('.catalog_points_yi')) {
            tasks.push(task)
        } else {
            finished_tasks.add(task.id)
        }
    }

    while (tasks.length > 0) {
        let task_id = tasks.pop().id;
        let task = document.querySelector(`.posCatalog_select#${task_id}`)

        task.querySelector('span').click();
        await waitUntil(() => task.classList.contains('posCatalog_active') || null, 100);

        let items = Array.from(await waitUntil(() => {
            let items = document.querySelectorAll('span.spanText');
            if (items.length == 0) { return null; }
            return items;
        }, 100));

        let exam_item = items.filter((e) => e.textContent == '章节测验')[0];
        if (exam_item == null) {
            finished_tasks.add(task.id);
            continue;
        }

        exam_item.click();
        await waitUntil(() => document.querySelector('.prev_list li.active[title="章节测验"]'), 100);

        let outer_frame = await wait_iframe(document, '.course_main iframe#iframe');
        let inner_frame = outer_frame.contentDocument.querySelector('.ans-attach-ct iframe');
        let exam_frame = inner_frame.contentDocument.querySelector('iframe#frame_content');

        let job_tag = await waitUntil(() => outer_frame.contentDocument.querySelector('div.ans-job-icon'), 100);
        if (job_tag.attributes['aria-label'].textContent != '任务点未完成') {
            finished_tasks.add(task.id);
            continue;
        }

        let last_answer = '';
        while (true) {
            let this_answer = await waitUntil(() => try_get_complete_answer(exam_frame.contentDocument), 500);
            if (this_answer == last_answer) { break; }
            last_answer = this_answer;
            console.log(`ans to question ${task_id}: ${this_answer}`);
        }

        (await waitUntil(() => exam_frame.contentDocument.querySelector('.btnSubmit'))).click();

        (await waitUntil(() => {
            let mask_display = document.querySelector('.maskDiv').style.display;
            if (mask_display == 'none') { return null; }
            //! ATTENTION: display equals 'block' is expected, but style may be null when triggered by click()
            return document.querySelector('.maskDiv .popBottom a#popok');
        }, 500)).click();

        await waitUntil(() => job_tag.attributes['aria-label'].textContent == '任务点已完成' || null, 100);

        finished_tasks.add(task.id);
    }
})();
