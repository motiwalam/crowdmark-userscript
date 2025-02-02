// ==UserScript==
// @name        Crowdmark Score Unlock
// @namespace   Violentmonkey Scripts
// @match       *://app.crowdmark.com/student/*
// @grant       none
// @version     1.0
// @author      Mustafa Motiwala
// @description Add a link to Crowdmark assessments to display grading information, even if marks have not been released.
// ==/UserScript==

const EM2UUID = Symbol("EM2UUID");
const SCORELINKID = "crowdmark-userscript-scorelink-id-hehe";

function singlePrecision(x) {
    return Math.round(10 * x) / 10;
}

function mean(numbers) {
    return singlePrecision(jStat.mean(numbers));
}

function median(numbers) {
    return singlePrecision(jStat.median(numbers));
}

function stdev(numbers) {
    return singlePrecision(jStat.stdev(numbers));
}

function statistics(results, outOf) {
    const meanPoints = mean(results);
    const medianPoints = median(results);
    const stdevPoints = stdev(results);
    const resultsPercent = results.map(x => Math.min(100, x / outOf * 100));
    const meanPercent = mean(resultsPercent);
    const medianPercent = median(resultsPercent);
    const stdevPercent = stdev(resultsPercent);
    return {
        meanPercent, medianPercent, stdevPercent,
        meanPoints, medianPoints, stdevPoints,
    };
}

async function getGlobalAssignmentInfo() {
    return await fetch("https://app.crowdmark.com/api/v2/student/assignments?fields%5Bexam-masters%5D%5B%5D=type&fields%5Bexam-masters%5D%5B%5D=title", {
        "credentials": "include",
        "referrer": "https://app.crowdmark.com/student/course-archive",
        "method": "GET",
        "mode": "cors"
    }).then(r => r.json());
}

async function getAssignmentIDS() {
    return await getGlobalAssignmentInfo().then(r => r.data.map(o => o.id));
}

async function getAssignmentData(assignment_id) {
    return await fetch("https://app.crowdmark.com/api/v1/student/results/" + assignment_id).then(r => r.json());
}

async function retrieveAllAssignmentData(assignment_ids) {
    return await Promise.all(
        assignment_ids.map(getAssignmentData)
    );
}

function evaluationInfo(assignment_data) {
    const masterToQuestion = Object.fromEntries(
        assignment_data.included
        .filter(({type}) => type === 'exam-questions')
        .map(o => [o.relationships['exam-master-question'].data.id, o])
    );
    const questionToMaster = Object.fromEntries(Object.entries(masterToQuestion).map(([k, v]) => [v.id, k]));
    const masterToAnnotations = (
        assignment_data.included
        .filter(({type}) => type == 'annotations')
        .map(o => [questionToMaster[o.relationships['exam-question'].data.id], o])
        .reduce((acc, [masterId, annotation]) => {
            if (!(masterId in acc)) acc[masterId] = [];
            acc[masterId].push(annotation.attributes);
            return acc;
        }, {})
    );
    const out = Object.fromEntries(
        assignment_data.included
        .filter(({type}) => type === 'exam-master-questions')
        .map(({id, attributes: {label, points: outOf}}) => {
            if (masterToQuestion[id] === undefined) {
                return [label, {score: undefined, outOf: undefined}];
            }
            const {attributes: {points: score}} = masterToQuestion[id];
            return [
                label, {score, outOf, annotations: masterToAnnotations[id]}
            ];
        })
    );

    return out;
}

function summarizeAssignmentData(assignment_data) {
    const course = assignment_data.included.filter(o => o.type === "courses")[0].attributes;
    const attrs = assignment_data.included.filter(o => o.type === "exam-masters")[0].attributes;
    const outOf = Number(attrs['total-points']);
    const results = attrs.results?.sort((a,b) => a-b);
    const evaluation = evaluationInfo(assignment_data);
    return {
        courseName: course.name,
        title: attrs.title,
        outOf: outOf,
        results: results,
        ...(results && statistics(results, outOf)),
        evaluation,
        uuid: assignment_data.data.id,
        scoreLink: `https://app.crowdmark.com/score/${assignment_data.data.id}`,
        examMasterId: assignment_data?.data?.relationships?.["exam-master"]?.data?.id
    };
}

function summarizeAllAssignmentData(assignment_datas) {
    const out = {};
    for (const assignment_data of assignment_datas) {
        const {courseName, title, ...summary} = summarizeAssignmentData(assignment_data);
        if (!(courseName in out)) out[courseName] = {};
        out[courseName][title] = summary;
    }
    return out;
}

async function getCompleteSummary() {
    const ids = await getAssignmentIDS();
    const data = await retrieveAllAssignmentData(ids);
    const totalSum = summarizeAllAssignmentData(data);
    return totalSum;
}

async function getCourseInfo() {
    const out = [];
    let page = 1;
    while (true) {
        const resp = await fetch(`https://app.crowdmark.com/api/v2/student/courses?page%5Bnumber%5D=${page}`, {
            "credentials": "include",
            "method": "GET",
            "mode": "cors"
        }).then(r=>r.json());

        out.push(...resp.data.map(o => ({
            id: o.id,
            name: o.attributes.name,
        })));

        page++;

        if (resp.meta.pagination['total-pages'] <= page) {
            break;
        }
    }
    return out;
}

async function getCourseStatistics(course_id) {
    return await fetch(`https://app.crowdmark.com/api/v2/student/courses/${course_id}/statistics`, {
        "credentials": "include",
        "method": "GET",
        "mode": "cors"
    }).then(r => r.json());
}

async function getAllPerfReports() {
    const courses = await getCourseInfo();
    const allStats = Object.fromEntries(await Promise.all(
        courses.map(({id}) => getCourseStatistics(id).then(r => [id, r]))
    ));
    const out = {};
    for (const {id, name} of courses) {
        const stats = allStats[id];
        out[name] = Object.fromEntries(stats.assessments.map(
            ({title, myScore, averageScore}) => [title, {myScore, averageScore}]
        ));
    }
    return out;
}

async function compareAverages() {
    const summary = await getCompleteSummary();
    const perfReports = await getAllPerfReports();

    const out = {};
    for (const course in summary) {
        if (!(course in out)) out[course] = {};

        for (const assgt in summary[course]) {
            out[course][assgt] = {
                individual: summary[course][assgt]?.meanPercent,
                perfReport: perfReports[course][assgt]?.averageScore,
            };
        }
    }

    return out;
}

function diffCompleteSummary(oldSummary, newSummary) {
    /* assumes no new courses/assgts */
    let diff = "";
    for (const [courseName, assgts] of Object.entries(oldSummary)) {
        for (const [assgtName, assgt] of Object.entries(assgts)) {
            if (JSON.stringify(assgt) !== JSON.stringify(newSummary?.[courseName]?.[assgtName])) {
                diff += `${assgtName} in ${courseName}\n`;
            }
        }
    }
    return diff;
}

async function watch(fn, timeout_secs, diff) {
    if (Notification.permission !== "granted") {
        throw new Error("need notification permission");
    }
    /* use singleton array as a sort of pointer */
    const dataptr = [await fn()];
    const term = setInterval(async () => {
        const oldData = dataptr[0];
        const newData = await fn();
        if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
            const n = new Notification("Data Changed!", {
                body: diff && await diff(oldData, newData),
            });
            setTimeout(() => n.close(), 5000);
        }
        dataptr[0] = newData;
    }, timeout_secs * 1000);

    return {
        stop() { clearInterval(term); },
        data() { return dataptr[0]; }
    };
}

async function getAssignmentExamMasterToUUID() {
    const assignment_ids = await getAssignmentIDS();
    const assignment_datas = await retrieveAllAssignmentData(assignment_ids);

    return Object.fromEntries(
        assignment_datas.map(o => {
            return [o?.data?.relationships?.['exam-master']?.data?.id, o?.data?.id]
        })
    );
}

function createScoreLink(uuid) {
    const aTag = document.createElement('a');
    aTag.id = SCORELINKID;
    aTag.href = `https://app.crowdmark.com/score/${uuid}`;
    aTag.innerText = "Shareable link";
    aTag.target = "_blank";
    return aTag;
}

function installScoreLink(uuid) {
    const header = document.getElementsByClassName('cm-assignment__header-top-content')[0];
    header?.appendChild(createScoreLink(uuid));
}

function getCurrentAssignmentUUID(em2uuid) {
    const examMasterId = window.location.pathname.split('/').at(-1);
    return em2uuid[examMasterId];
}

async function installScoreUnlocker(period_secs=1) {
    window[EM2UUID] = await getAssignmentExamMasterToUUID();
    return setInterval(() => {
        if (document.getElementById(SCORELINKID) === null) {
            const uuid = getCurrentAssignmentUUID(window[EM2UUID]);
            if (uuid) installScoreLink(uuid);
        }
    }, period_secs * 1000);
}

installScoreUnlocker();