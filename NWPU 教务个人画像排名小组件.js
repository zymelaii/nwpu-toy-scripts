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

var rankScoreItem = null;
var currentSemester = null;
var studentId = null;

const studentIdTask = getStudentId();

async function getStudentId() {
    const reqUrl = 'https://jwxt.nwpu.edu.cn/student/for-std/student-portrait/getStdInfo?bizTypeAssoc=2&cultivateTypeAssoc=1';
    const resp = await await fetch(reqUrl)
    const json = await resp.json();
    return json?.student?.id;
}

async function fetchLatestRank(semesterId) {
    //! NOTE: studentId can be found by localStorage['cs-course-select-student-id'],
    //! but it is not always available
    if (studentId === null) {
        studentId = await studentIdTask;
    }

    const gradeReqUrl = `https://jwxt.nwpu.edu.cn/${portraitSource}/getMyGrades?studentAssoc=${studentId}&semesterAssoc=${semesterId}`;
    const resp = await fetch(gradeReqUrl);
    const json = await resp.json();
    return json.stdGpaRankDto.rank;
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

async function updateRankScore(semesterText) {
    let semesterId = '';
    if (currentSemester !== null && semesterText !== '') {
        let semester = currentSemester;
        while (semester.name != semesterText) {
            semester = semester.prevSemester;
            if (semester === null) { break; }
        }
        if (semester !== null) {
            semesterId = semester.id.toString();
        }
    }

    let rank = await fetchLatestRank(semesterId);
    if (rank !== null) {
        rankScoreItem.querySelector('.score').textContent = rank;
    }
}

async function trySetupRankScore() {
    let scoreContent = await waitUntil(() => {
        return findPortaitPage()?.contentDocument?.querySelector('.score-content');
    }, 50);
    let items = await waitUntil(() => scoreContent.querySelectorAll('.score-item'), 100);

    const info = '专业排名';
    let result = Array.from(items).find(tag => tag.querySelector('div.info')?.textContent === info);

    if (result !== undefined) {
        return;
    }

    rankScoreItem = buildRankItem();
    scoreContent.appendChild(rankScoreItem);

    updateRankScore('');
}

(async function setup() {
    let pageContent = await waitUntil(() => document.querySelector('.e-op-area-iframe-container'), 500);

    let pageObserver = (new MutationObserver(async (mutationList, observer) => {
        const predict = (tag) => tag.localName == 'iframe' && tag?.src.endsWith(portraitSource);
        for (const record of mutationList) {
            let portraitPage = Array.from(record.addedNodes).find(predict);
            if (portraitPage === undefined) { continue; }
            portraitPage.addEventListener('load', async (event) => {
                await trySetupRankScore();

                //! NOTE: listener is not sensitive to the readonly input, track select items instead

                //! NOTE: this will not return until user opens the semester select
                let semesterSelect = await waitUntil(() => {
                    return findPortaitPage()?.contentDocument.querySelector('body > div.el-select-dropdown ul');
                }, 1000);

                //! NOTE: atfer select is done, we can get the script code to get semester info
                let varDeclScript = await waitUntil(() => {
                    return findPortaitPage()?.contentDocument.querySelector('body > script');
                }, 100);

                currentSemester = ((code) => {
                    const exportObject = {};
                    (() => {
                        eval(code);
                        exportObject.currentSemester = currentSemester;
                    })();
                    return exportObject;
                })(varDeclScript.textContent).currentSemester;

                let semesterSelectObserver = new MutationObserver(async (mutationList, observer) => {
                    for (const record of mutationList) {
                        if (record.attributeName !== 'class') { continue; }
                        let item = record.target;
                        let selected = item.classList.contains('selected');
                        let alreadySelected = record.oldValue.includes('selected');
                        if (selected && !alreadySelected) {
                            updateRankScore(item.querySelector('span').textContent);
                            break;
                        }
                    }
                });

                semesterSelectObserver.observe(semesterSelect, {
                    attributes: true,
                    attributeOldValue: true,
                    subtree: true,
                });
            });
            break;
        }
    }));

    pageObserver.observe(pageContent, {
        childList: true,
    });
})();
