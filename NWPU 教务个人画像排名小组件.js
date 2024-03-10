// ==UserScript==
// @name         NWPU 教务系统个人画像排名小组件
// @namespace    http://tampermonkey.net/
// @version      2024-03-09
// @description  学生画像「我的成绩」面板增加「专业排名」
// @author       Zymelaii Ryer
// @match        https://jwxt.nwpu.edu.cn/student/home
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

const portraitSource = `student/for-std/student-portrait`;

async function fetchLatestRank() {
    let studentId = localStorage['cs-course-select-student-id'];
    let gradeReqUrl = `https://jwxt.nwpu.edu.cn/student/for-std/student-portrait/getMyGrades?studentAssoc=${studentId}&semesterAssoc=`;
    try {
        let resp = await fetch(gradeReqUrl);
        let json = await resp.json();
        return json.stdGpaRankDto.rank;
    } catch {
        return null;
    }
}

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

function buildRankItem() {
    const itemContent = `
<li class="score-item pink">
    <div class="icon-img">
        <i class="icon-paimin"></i>
    </div>
    <div class="score-info">
        <div class="score">{}</div>
        <div class="info">专业排名</div>
    </div>
</li>
`;
    return document.createRange().createContextualFragment(itemContent).querySelector('.score-item');
}

function findPortaitPage() {
    return Array.from(document.querySelectorAll('iframe')).find(page => page.src.endsWith(portraitSource));
}

async function trySetupRankScore() {
    let scoreContent = await waitUntil(() => {
        return findPortaitPage()?.contentDocument?.querySelector('.score-content');
    }, 500);
    let items = await waitUntil(() => scoreContent.querySelectorAll('.score-item'), 500);

    const info = '专业排名';
    let result = Array.from(items).find(tag => tag.querySelector('div.info')?.textContent === info);

    if (result !== undefined) {
        return;
    }

    let item = buildRankItem();
    scoreContent.appendChild(item);

    let rank = await fetchLatestRank();
    if (rank !== null) {
        item.querySelector('.score').textContent = rank;
    }
}

(async function setup() {
    let pageContent = await waitUntil(() => document.querySelector('.e-op-area-iframe-container'), 500);

    let pageObserver = new MutationObserver(async (mutationList, observer) => {
        const predict = (tag) => tag.localName == 'iframe' && tag?.src.endsWith(portraitSource);
        for (const record of mutationList) {
            let portraitPage = Array.from(record.addedNodes).find(predict);
            if (portraitPage !== undefined) {
                portraitPage.addEventListener('load', () => {
                    trySetupRankScore();
                });
                break;
            }
        }
    });

    pageObserver.observe(pageContent, {
        childList: true,
    });
})();
