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
    }
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
        })))
        
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

async function getAssignmentIDS() {
    return await fetch("https://app.crowdmark.com/api/v2/student/assignments?fields%5Bexam-masters%5D%5B%5D=type&fields%5Bexam-masters%5D%5B%5D=title", {
        "credentials": "include",
        "referrer": "https://app.crowdmark.com/student/course-archive",
        "method": "GET",
        "mode": "cors"
    }).then(r => r.json()).then(r => r.data.map(o => o.id));
}

async function getAssignmentData(assignment_id) {
    return await fetch("https://app.crowdmark.com/api/v1/student/results/" + assignment_id).then(r => r.json());
}

async function retrieveAllAssignmentData(assignment_ids) {
    return await Promise.all(
        assignment_ids.map(getAssignmentData)
    )
}

function summarizeAssignmentData(assignment_data) {
    const course = assignment_data.included.filter(o => o.type === "courses")[0].attributes;
    const attrs = assignment_data.included.filter(o => o.type === "exam-masters")[0].attributes;
    const outOf = Number(attrs['total-points']);
    const results = attrs.results?.sort((a,b) => a-b);
    return {
        courseName: course.name,
        title: attrs.title,
        outOf: outOf,
        results: results,
        ...(results && statistics(results, outOf)),
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

async function getAllPerfReports() {
    const courses = await getCourseInfo();
    const allStats = Object.fromEntries(await Promise.all(
        courses.map(({id}) => getCourseStatistics(id).then(r => [id, r]))
    ))
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